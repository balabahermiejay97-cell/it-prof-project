// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./components/landing";
import Register from "./components/register";
import Login from "./components/login";
import CustomerHomepage from "./components/customerhomepage";
import Admin from "./components/admin";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page - home */}
        <Route path="/" element={<Landing />} />
        
        {/* Auth routes */}
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        {/* Customer shopping area */}
        <Route path="/customer" element={<CustomerHomepage />} />

        {/* Admin management area */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
