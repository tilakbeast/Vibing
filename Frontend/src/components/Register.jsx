import React, { useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

// List of preference options (binary choices)
const preferencesList = [
  ["Adventurous", "Grounded"],
  ["Reserved", "Outgoing"],
  ["Driven", "Easygoing"],
  ["Imaginative", "Pragmatic"],
  ["Active Lifestyle", "Relaxed Lifestyle"],
  ["Spiritual", "Analytical"],
  ["Enjoys Animals", "Less Focused on Pets"],
  ["Adventurous Eater", "Selective Eater"],
  ["Night-Oriented", "Morning-Oriented"],
  ["Family-Centered", "Independence-Centered"],
];

const Register = ({ onRegisterSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [preferences, setPreferences] = useState(Array(10).fill(null));
  const [error, setError] = useState("");

  const handlePreferenceChange = (index, value) => {
    const updated = [...preferences];
    updated[index] = value;
    setPreferences(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all preferences are selected
    if (preferences.includes(null)) {
      setError("Please answer all preferences!");
      return;
    }

    try {
      // Convert preferences array to binary string
      const preferencesBinary = preferences.join("");

      // Call backend register API
      const res = await axios.post("http://localhost:3000/register", {
        username,
        password,
        preferences: preferencesBinary,
      });

      const token = res.data.token; // JWT from backend
      localStorage.setItem("token", token);

      // Initialize socket with token
    //   const socket = io("http://localhost:3000", { auth: { token } });
    //   socket.on("connect", () => console.log("Socket connected:", socket.id));
    //   socket.on("connect_error", (err) => console.error("Socket error:", err.message));

      // Notify parent component
      onRegisterSuccess(token);

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Registration failed");
    }
  };

  return (
    <div style={{ maxWidth: "500px", margin: "auto" }}>
      <h2>Register</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <br />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <br />
        <h4>Preferences</h4>
        {preferencesList.map(([optionA, optionB], idx) => (
          <div key={idx} style={{ marginBottom: "10px" }}>
            <p>{`Preference ${idx + 1}:`}</p>
            <label>
              <input
                type="radio"
                name={`pref-${idx}`}
                value="0"
                checked={preferences[idx] === 0}
                onChange={() => handlePreferenceChange(idx, 0)}
              />
              {optionA}
            </label>
            <label style={{ marginLeft: "10px" }}>
              <input
                type="radio"
                name={`pref-${idx}`}
                value="1"
                checked={preferences[idx] === 1}
                onChange={() => handlePreferenceChange(idx, 1)}
              />
              {optionB}
            </label>
          </div>
        ))}

        <button type="submit">Register</button>
      </form>
    </div>
  );
};

export default Register;
