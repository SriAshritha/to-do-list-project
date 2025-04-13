import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import session from "express-session";
import bcrypt from "bcrypt";

const app = express();
const port = 3000;

// Database connection with error handling
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "permalist",
  password: "Harshu@2005",
  port: 5432,
});

db.connect()
  .then(() => {
    console.log("Database connection successful");
    // Call setup only after successful connection
    setupDatabase();
  })
  .catch(err => {
    console.error("Database connection error:", err);
  });

// Add session middleware
app.use(session({
  secret: "your-secret-key", // Change this to a strong random string in production
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set('view engine', 'ejs');

// Middleware to check if user is authenticated
const requireLogin = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Database Setup
const setupDatabase = async () => {
  try {
    // First ensure the users table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Now check and update items table
    const checkItemsResult = await db.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name = 'items'
       )`
    );
    
    if (!checkItemsResult.rows[0].exists) {
      await db.query(`
        CREATE TABLE items (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          due_date DATE,
          user_id INTEGER
        )
      `);
    } else {
      // Check and add due_date column if needed
      const checkDueDateColumn = await db.query(
        `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'items' AND column_name = 'due_date'`
      );
     
      if (checkDueDateColumn.rows.length === 0) {
        await db.query(
          `ALTER TABLE items ADD COLUMN due_date DATE`
        );
      }

      // Add user_id column to items table if it doesn't exist
      const checkUserIdColumn = await db.query(
        `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'items' AND column_name = 'user_id'`
      );

      if (checkUserIdColumn.rows.length === 0) {
        await db.query(
          `ALTER TABLE items ADD COLUMN user_id INTEGER`
        );
      }
    }
    
    // Check if habits table exists
    const checkHabitsResult = await db.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name = 'habits'
       )`
    );
    
    if (!checkHabitsResult.rows[0].exists) {
      // Create habits table if it doesn't exist
      await db.query(`
        CREATE TABLE habits (
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
          last_completed DATE,
          user_id INTEGER
        )
      `);
    } else {
      // Check if user_id column exists in habits table
      const checkHabitUserIdColumn = await db.query(
        `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'habits' AND column_name = 'user_id'`
      );

      if (checkHabitUserIdColumn.rows.length === 0) {
        // Add user_id column if it doesn't exist
        await db.query(
          `ALTER TABLE habits ADD COLUMN user_id INTEGER`
        );
      }
    }

    // Check and create habit_logs table
    const checkHabitLogsResult = await db.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name = 'habit_logs'
       )`
    );
    
    if (!checkHabitLogsResult.rows[0].exists) {
      // Create habit_logs table with ON DELETE CASCADE
      await db.query(`
        CREATE TABLE habit_logs (
          id SERIAL PRIMARY KEY,
          habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
          completed_date DATE,
          UNIQUE(habit_id, completed_date)
        )
      `);
    }

    console.log("Database schema updated successfully!");
  } catch (err) {
    console.error("Error setting up database:", err);
  }
};

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

// AUTH ROUTES
app.get("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    // Validate input
    if (!username || !email || !password) {
      return res.render("register", { 
        error: "All fields are required" 
      });
    }
    
    // Check if username or email already exists
    const existingUser = await db.query(
      "SELECT * FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.render("register", { 
        error: "Username or email already exists" 
      });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Insert new user
    const result = await db.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id",
      [username, email, hashedPassword]
    );
    
    // Set session and redirect
    req.session.userId = result.rows[0].id;
    req.session.username = username;
    res.redirect("/");
    
  } catch (err) {
    console.error("Registration error:", err);
    res.render("register", { error: "Error during registration: " + err.message });
  }
});

app.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Find user by username
    const result = await db.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.render("login", { error: "Invalid username or password" });
    }
    
    const user = result.rows[0];
    
    // Compare passwords
    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
      return res.render("login", { error: "Invalid username or password" });
    }
    
    // Set session and redirect
    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect("/");
    
  } catch (err) {
    console.error("Login error:", err);
    res.render("login", { error: "Error during login: " + err.message });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/login");
  });
});

// MAIN ROUTES - Protected routes
app.get("/", requireLogin, async (req, res) => {
  try {
    // Fetch items for current user
    const itemsResult = await db.query(
      "SELECT * FROM items WHERE user_id = $1 OR user_id IS NULL ORDER BY due_date ASC, id ASC",
      [req.session.userId]
    );
    const items = itemsResult.rows.map(item => ({
      ...item,
      category: categorizeByDate(item.due_date)
    }));

    // Fetch habits for current user - FIXED QUERY
    // First check if user_id column exists in habits table
    const checkUserIdColumn = await db.query(
      `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'habits' AND column_name = 'user_id'`
    );

    let habits = [];
    if (checkUserIdColumn.rows.length > 0) {
      // If user_id column exists, use it in the query
      const habitsResult = await db.query(`
        SELECT h.*,
               (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND completed_date = CURRENT_DATE) as completed_today
        FROM habits h
        WHERE h.user_id = $1 OR h.user_id IS NULL
        ORDER BY h.id
      `, [req.session.userId]);
      habits = habitsResult.rows;
    } else {
      // If user_id column doesn't exist, fetch all habits (temporary fallback)
      const habitsResult = await db.query(`
        SELECT h.*,
               (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND completed_date = CURRENT_DATE) as completed_today
        FROM habits h
        ORDER BY h.id
      `);
      habits = habitsResult.rows;
    }

    res.render("index", {
      listTitle: `${req.session.username}'s Task Manager`,
      listItems: items,
      habits: habits,
      username: req.session.username
    });
  } catch (err) {
    console.error("Error fetching dashboard data:", err);
    res.status(500).send("Database error: " + err.message);
  }
});

// Items Routes - Update to include user_id
app.post("/add", requireLogin, async (req, res) => {
  const item = req.body.newItem;
  const date = req.body.itemDate || null;
  
  try {
    await db.query(
      "INSERT INTO items (title, due_date, user_id) VALUES ($1, $2, $3)", 
      [item, date, req.session.userId]
    );
    res.redirect("/");
  } catch (err) {
    console.log("Error adding item:", err);
    res.status(500).send("Error adding item: " + err.message);
  }
});

app.post("/edit", requireLogin, async (req, res) => {
  const item = req.body.updatedItemTitle;
  const id = req.body.updatedItemId;
  const date = req.body.updatedItemDate || null;

  try {
    // Make sure user can only edit their own items
    await db.query(
      "UPDATE items SET title = $1, due_date = $2 WHERE id = $3 AND (user_id = $4 OR user_id IS NULL)", 
      [item, date, id, req.session.userId]
    );
    res.redirect("/");
  } catch (err) {
    console.log("Error updating item:", err);
    res.status(500).send("Error updating item: " + err.message);
  }
});

app.post("/delete", requireLogin, async (req, res) => {
  const id = req.body.deleteItemId;
  try {
    // Make sure user can only delete their own items
    await db.query(
      "DELETE FROM items WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)", 
      [id, req.session.userId]
    );
    res.redirect("/");
  } catch (err) {
    console.log("Error deleting item:", err);
    res.status(500).send("Error deleting item: " + err.message);
  }
});

// Habits Routes - Update to include user_id
app.post("/add-habit", requireLogin, async (req, res) => {
  const { habitTitle, habitDescription, habitDays } = req.body;
 
  try {
    // Check if user_id column exists in habits table
    const checkUserIdColumn = await db.query(
      `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'habits' AND column_name = 'user_id'`
    );

    // Normalize days to be an array if it's not already
    const daysArray = Array.isArray(habitDays) ? habitDays : (habitDays ? [habitDays] : []);

    if (checkUserIdColumn.rows.length > 0) {
      // If user_id column exists, include it in the query
      await db.query(
        `INSERT INTO habits (title, description, monday, tuesday, wednesday, thursday, friday, saturday, sunday, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          habitTitle,
          habitDescription || null,
          daysArray.includes('monday'),
          daysArray.includes('tuesday'),
          daysArray.includes('wednesday'),
          daysArray.includes('thursday'),
          daysArray.includes('friday'),
          daysArray.includes('saturday'),
          daysArray.includes('sunday'),
          req.session.userId
        ]
      );
    } else {
      // If user_id column doesn't exist, omit it from the query
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
    }
    
    res.redirect("/");
  } catch (err) {
    console.error("Error adding habit:", err);
    res.status(500).send("Error adding habit: " + err.message);
  }
});

app.post("/toggle-habit", requireLogin, async (req, res) => {
  const { habitId } = req.body;

  try {
    // Check if user_id column exists in habits table
    const checkUserIdColumn = await db.query(
      `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'habits' AND column_name = 'user_id'`
    );

    let habitResult;
    if (checkUserIdColumn.rows.length > 0) {
      // If user_id column exists, use it in the query
      habitResult = await db.query(
        "SELECT * FROM habits WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)",
        [habitId, req.session.userId]
      );
    } else {
      // If user_id column doesn't exist, fetch habit by ID only
      habitResult = await db.query(
        "SELECT * FROM habits WHERE id = $1",
        [habitId]
      );
    }
    
    if (habitResult.rows.length === 0) {
      return res.status(403).send("Habit not found or unauthorized");
    }

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

app.post("/delete-habit", requireLogin, async (req, res) => {
  const { habitId } = req.body;
 
  try {
    // Check if user_id column exists in habits table
    const checkUserIdColumn = await db.query(
      `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'habits' AND column_name = 'user_id'`
    );

    let habitResult;
    if (checkUserIdColumn.rows.length > 0) {
      // If user_id column exists, use it in the query
      habitResult = await db.query(
        "SELECT * FROM habits WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)",
        [habitId, req.session.userId]
      );
    } else {
      // If user_id column doesn't exist, fetch habit by ID only
      habitResult = await db.query(
        "SELECT * FROM habits WHERE id = $1",
        [habitId]
      );
    }
    
    if (habitResult.rows.length === 0) {
      return res.status(403).send("Habit not found or unauthorized");
    }

    // Delete the habit (associated logs will be automatically deleted due to CASCADE)
    await db.query("DELETE FROM habits WHERE id = $1", [habitId]);
   
    res.redirect("/");
  } catch (err) {
    console.error("Error deleting habit:", err);
    res.status(500).send("Error deleting habit: " + err.message);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});