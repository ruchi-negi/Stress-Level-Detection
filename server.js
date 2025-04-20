const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const { exec } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MySQL connection config for stress_db (user data)
const dbUsers = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "1234",
  database: "stress_db",
});

// MySQL connection config for text (dataset and results)
const dbText = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "1234",
  database: "text",
});

dbUsers.connect((err) => {
  if (err) {
    console.error("Error connecting to stress_db:", err);
  } else {
    console.log("Connected to stress_db!");
  }
});

dbText.connect((err) => {
  if (err) {
    console.error("Error connecting to text database:", err);
  } else {
    console.log("Connected to text database!");
  }
});

// User registration
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).json({ success: false, message: "Error hashing password." });

    dbUsers.query("SELECT * FROM users WHERE username = ?", [username], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "Error checking user." });
      if (result.length > 0) return res.status(409).json({ success: false, message: "User already exists." });

      dbUsers.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Error inserting user." });
        return res.status(200).json({ success: true, message: "User registered successfully!" });
      });
    });
  });
});

// User login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  dbUsers.query("SELECT * FROM users WHERE username = ?", [username], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Error checking user." });
    if (result.length === 0) return res.status(404).json({ success: false, message: "User not found." });

    bcrypt.compare(password, result[0].password, (err, isMatch) => {
      if (err) return res.status(500).json({ success: false, message: "Error comparing password." });
      if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials." });

      return res.status(200).json({
        success: true,
        message: "Login successful!",
        token: username  // Just sending back username as a mock token
      });
      
      
    });
  });
});

app.post("/api/questionnaire", (req, res) => {
  const { answers, userDetails } = req.body;

  if (!Array.isArray(answers) || answers.some((ans) => typeof ans !== "number")) {
    return res.status(400).json({ success: false, message: "Invalid answers format." });
  }

  const totalScore = answers.reduce((acc, curr) => acc + curr, 0);
  let predictedStress;

  if (totalScore <= 5) predictedStress = "Not Stressed";
  else if (totalScore <= 10) predictedStress = "Moderately Stressed";
  else predictedStress = "Highly Stressed";

  // Save user details and questionnaire result in MySQL (stress_db)
  const query = "INSERT INTO questionnaire_results (name, email, age, answers, score, predicted_stress, timestamp) VALUES (?, ?, ?, ?, ?, ?, NOW())";
  const answersString = JSON.stringify(answers);

  dbUsers.query(
    query,
    [userDetails.name, userDetails.email, userDetails.age, answersString, totalScore, predictedStress],
    (err, result) => {
      if (err) {
        console.error("Error saving questionnaire result:", err);
        return res.status(500).json({ success: false, message: "Failed to save result." });
      }

      // Send the resultId back as part of the response
      return res.status(200).json({ success: true, predictedStress, resultId: result.insertId });
    }
  );
});

app.get('/api/results', (req, res) => {
  const query = 'SELECT name, email, age, answers, predicted_stress FROM questionnaire_results';
  
  dbUsers.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching results:', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    res.json(results);
  });
});



// Port and server setup
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
