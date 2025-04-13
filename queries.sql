-- queries.sql
-- CREATE TABLE IF NOT EXISTS habits (
--     id SERIAL PRIMARY KEY,
--     name TEXT NOT NULL,
--     progress INT CHECK (progress >= 0 AND progress <= 100) DEFAULT 0
-- );

-- Task Table
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  due_date DATE,
  reminder_date TIMESTAMP,
  reminder_sent BOOLEAN DEFAULT FALSE
);

-- Habits Table
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
);

-- Habit Logs Table
CREATE TABLE IF NOT EXISTS habit_logs (
  id SERIAL PRIMARY KEY,
  habit_id INTEGER REFERENCES habits(id),
  completed_date DATE,
  UNIQUE(habit_id, completed_date)
);

-- Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  remind_time TIMESTAMP NOT NULL,
  sent BOOLEAN DEFAULT FALSE
);