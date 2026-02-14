"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [users, setUsers] = useState<any[]>([]);
  const [name, setName] = useState("");

  // Fetch users
  const fetchUsers = async () => {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Add user
  const addUser = async () => {
    if (!name) return;

    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    setName("");
    fetchUsers(); // refresh list
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Users List</h1>

      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Enter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginRight: "10px" }}
        />
        <button onClick={addUser}>Add User</button>
      </div>

      {users.map((user) => (
        <p key={user.id}>{user.name}</p>
      ))}
    </div>
  );
}
