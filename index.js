import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "permalist",
  password: "Harshu@2005",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set('view engine', 'ejs');

// Database Setup
const setupDatabase = async () => {
  try {
    // Check and update items table
    const checkItemsResult = await db.query(
      `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'items' AND column_name = 'due_date'`
    );
   
    if (checkItemsResult.rows.length === 0) {
      await db.query(
        `ALTER TABLE items
        ADD COLUMN IF NOT EXISTS due_date DATE`
      );
    }

    // Create habits table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        monday BOOLEAN DEFAULT false,
        tuesday BOOLEAN DEFAULT false,
        wednesday BOOLEAN DEFAULT false,
        thursday BOOLEAN DEFAULT false,
        friday BOOLEAN DEFAULT false,
        saturday BOOLEAN DEFAULT false,
        sunday BOOLEAN DEFAULT false,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_completed DATE
      )
    `);

    // Create habit_logs table to track daily completions
    await db.query(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER REFERENCES habits(id),
        completed_date DATE,
        UNIQUE(habit_id, completed_date)
      )
    `);

    console.log("Database schema updated successfully!");
  } catch (err) {
    console.error("Error setting up database:", err);
    
    // Fallback to create items table if it doesn't exist
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          due_date DATE
        )
      `);
      console.log("Created items table successfully!");
    } catch (createErr) {
      console.error("Error creating table:", createErr);
    }
  }
};

// Call the setup function when the app starts
setupDatabase();

// Helper function for task categorization
function categorizeByDate(dueDate) {
  if (!dueDate) return "daily";
 
  const today = new Date();
  const due = new Date(dueDate);
 
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
 
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
 
  if (diffDays <= 1) {
    return "daily";
  } else if (diffDays <= 7) {
    return "weekly";
  } else {
    return "monthly";
  }
}

// Main route - fetch items and habits
app.get("/", async (req, res) => {
  try {
    // Fetch items
    const itemsResult = await db.query("SELECT * FROM items ORDER BY due_date ASC, id ASC");
    const items = itemsResult.rows.map(item => ({
      ...item,
      category: categorizeByDate(item.due_date)
    }));

    // Fetch habits with today's completion status
    const habitsResult = await db.query(`
      SELECT h.*,
             (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND completed_date = CURRENT_DATE) as completed_today
      FROM habits h
      ORDER BY h.id
    `);
    const habits = habitsResult.rows;

    res.render("index", {
      listTitle: "Task Manager",
      listItems: items,
      habits: habits
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// Items Routes
app.post("/add", async (req, res) => {
  const item = req.body.newItem;
  const date = req.body.itemDate || null;
  
  try {
    await db.query(
      "INSERT INTO items (title, due_date) VALUES ($1, $2)", 
      [item, date]
    );
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding item");
  }
});

app.post("/edit", async (req, res) => {
  const item = req.body.updatedItemTitle;
  const id = req.body.updatedItemId;
  const date = req.body.updatedItemDate || null;

  try {
    await db.query(
      "UPDATE items SET title = $1, due_date = $2 WHERE id = $3", 
      [item, date, id]
    );
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error updating item");
  }
});

app.post("/delete", async (req, res) => {
  const id = req.body.deleteItemId;
  try {
    await db.query("DELETE FROM items WHERE id = $1", [id]);
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error deleting item");
  }
});

// Habits Routes
app.post("/add-habit", async (req, res) => {
  const { habitTitle, habitDescription, habitDays } = req.body;
 
  try {
    // Normalize days to be an array if it's not already
    const daysArray = Array.isArray(habitDays) ? habitDays : (habitDays ? [habitDays] : []);

    await db.query(
      `INSERT INTO habits (title, description, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        habitTitle,
        habitDescription || null,
        daysArray.includes('monday'),
        daysArray.includes('tuesday'),
        daysArray.includes('wednesday'),
        daysArray.includes('thursday'),
        daysArray.includes('friday'),
        daysArray.includes('saturday'),
        daysArray.includes('sunday')
      ]
    );
    res.redirect("/");
  } catch (err) {
    console.error("Error adding habit:", err);
    res.status(500).send("Error adding habit: " + err.message);
  }
});

app.post("/toggle-habit", async (req, res) => {
  const { habitId } = req.body;

  try {
    // Check if habit is already completed today
    const existingLog = await db.query(
      `SELECT * FROM habit_logs
       WHERE habit_id = $1 AND completed_date = CURRENT_DATE`,
      [habitId]
    );

    if (existingLog.rows.length > 0) {
      // If already completed, remove the log and reset streak if needed
      await db.query(
        `DELETE FROM habit_logs
         WHERE habit_id = $1 AND completed_date = CURRENT_DATE`,
        [habitId]
      );

      // Reset the streak only if today was counted as part of the streak
      await db.query(`
        UPDATE habits
        SET current_streak = 
          CASE 
            WHEN current_streak > 0 THEN current_streak - 1
            ELSE 0
          END
        WHERE id = $1
      `, [habitId]);
      
    } else {
      // If not completed, add the log
      await db.query(
        `INSERT INTO habit_logs (habit_id, completed_date)
         VALUES ($1, CURRENT_DATE)`,
        [habitId]
      );

      // Fetch the last completion date (excluding today)
      const lastLog = await db.query(
        `SELECT MAX(completed_date) as last_date
         FROM habit_logs
         WHERE habit_id = $1 AND completed_date < CURRENT_DATE`,
        [habitId]
      );

      const lastCompletedDate = lastLog.rows[0]?.last_date;

      if (lastCompletedDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const lastDate = new Date(lastCompletedDate);

        if (lastDate.toDateString() === yesterday.toDateString()) {
          // If last completed was yesterday, increment streak
          await db.query(`
            UPDATE habits
            SET current_streak = current_streak + 1,
                longest_streak = GREATEST(longest_streak, current_streak + 1)
            WHERE id = $1
          `, [habitId]);
        } else {
          // If last completed was NOT yesterday, reset streak
          await db.query(`
            UPDATE habits
            SET current_streak = 1
            WHERE id = $1
          `, [habitId]);
        }
      } else {
        // First-time completion, set streak to 1
        await db.query(`
          UPDATE habits
          SET current_streak = 1
          WHERE id = $1
        `, [habitId]);
      }
    }

    res.redirect("/");
  } catch (err) {
    console.error("Error toggling habit:", err);
    res.status(500).send("Error toggling habit: " + err.message);
  }
});


app.post("/delete-habit", async (req, res) => {
  const { habitId } = req.body;
 
  try {
    // First delete associated logs
    await db.query("DELETE FROM habit_logs WHERE habit_id = $1", [habitId]);
   
    // Then delete the habit
    await db.query("DELETE FROM habits WHERE id = $1", [habitId]);
   
    res.redirect("/");
  } catch (err) {
    console.error("Error deleting habit:", err);
    res.status(500).send("Error deleting habit");
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});