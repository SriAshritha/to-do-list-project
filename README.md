# to-do-list-project
# Task Manager and Habit Tracker

A full-stack web application that helps users manage their tasks and build habits with database persistence.

## Database Interaction Overview

This project uses PostgreSQL as its database management system (DBMS) to store and manage user data, tasks, habits, and habit tracking logs.

### Database Schema

The application uses four main tables:

1. **users**
   - Stores user authentication information
   - Fields: id, username, email, password (hashed), created_at

2. **items**
   - Stores tasks with optional due dates
   - Fields: id, title, due_date, user_id (foreign key to users)

3. **habits**
   - Stores habit tracking data
   - Fields: id, title, description, day-specific booleans (monday through sunday), current_streak, longest_streak, last_completed, user_id

4. **habit_logs**
   - Tracks individual habit completions
   - Fields: id, habit_id (foreign key to habits with CASCADE delete), completed_date

### Database Connection and Setup

The application connects to PostgreSQL using the `pg` library:

```javascript
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "permalist",
  password: "*******",
  port: 5432,
});
```

During application startup, the database schema is checked and created if necessary using the `setupDatabase()` function. This includes:
- Creating tables if they don't exist
- Adding columns to existing tables if needed
- Setting up appropriate relationships and constraints

### Key Database Operations

#### User Authentication
- **Registration**: Inserts new user with bcrypt-hashed password
- **Login**: Queries user by username and verifies password hash

#### Task Management
- **Create**: Inserts new tasks with user_id to maintain data ownership
- **Read**: Fetches tasks filtered by user_id and sorts by due date
- **Update**: Updates task titles and due dates
- **Delete**: Removes tasks from the database

#### Habit Tracking
- **Create**: Inserts new habits with day-specific tracking preferences
- **Toggle Completion**: Inserts or deletes habit_logs records to track daily completion
- **Streaks**: Updates current_streak and longest_streak based on completion history
- **Delete**: Removes habits (and related logs via CASCADE)

### Data Security Measures

1. **User Authentication**: Session-based authentication with express-session
2. **Password Security**: Passwords are hashed using bcrypt before storage
3. **Data Isolation**: Users can only access their own data (user_id filtering)
4. **Input Validation**: Server-side validation prevents invalid data entry
5. **SQL Injection Prevention**: Parameterized queries protect against SQL injection

### Database Performance Considerations

1. **Indexing**: Primary keys are automatically indexed
2. **Query Optimization**: Joins are minimized, and WHERE clauses filter data efficiently
3. **Transaction Management**: Implicit transactions for data consistency

## Full Stack Web Development Aspects

This project demonstrates key elements of full-stack web development:

### Frontend
- **EJS Templates**: Server-side rendering with embedded JavaScript templates
- **CSS**: Styling for user interface components
- **JavaScript**: Client-side interactivity for tab navigation and form handling

### Backend
- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **RESTful API**: Standard HTTP methods for CRUD operations
- **Middleware**: Request processing pipeline with authentication checks

### Data Management
- **PostgreSQL**: Relational database for persistent storage
- **Database Schema**: Well-defined data structure with relationships

### Authentication & Security
- **Session Management**: Persistent user sessions with cookies
- **Password Hashing**: Secure credential storage
- **Access Control**: Route protection with middleware

### Application Features
- **Task Management**: Create, read, update, and delete tasks
- **Due Date Tracking**: Organize tasks by timeframe (daily, weekly, monthly)
- **Habit Tracking**: Track daily habits with completion history
- **Streak Counting**: Monitor consistency with current and longest streaks

## Development Workflow

To work with the database in this project:

1. **Setup PostgreSQL**: Install and configure PostgreSQL server
2. **Create Database**: Create a database named "permalist"
3. **Configure Connection**: Update database credentials in app.js if necessary
4. **Run Application**: The app will automatically set up the required schema
5. **Database Maintenance**: Use PostgreSQL tools for database backups and maintenance

Team Branding: The footer is named "Tikey" representing our team name and identity

The application demonstrates proper separation of concerns, with database operations making it maintainable and extensible.
