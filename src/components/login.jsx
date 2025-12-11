import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import bcrypt from "bcryptjs";
import logo from "../assets/logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      // Fetch user row
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email.toLowerCase())
        .single();

      if (error) {
        // network or server error
        console.error("Supabase error on login fetch:", error);
        setErrorMsg(error.message || "Failed to fetch user. Please try again.");
        setLoading(false);
        return;
      }

      if (!user) {
        setErrorMsg("Invalid email or password.");
        setLoading(false);
        return;
      }

      // Validate password hash
      let isValid = false;
      try {
        isValid = bcrypt.compareSync(password, user.password_hash || "");
      } catch (err) {
        console.error("bcrypt error", err);
        setErrorMsg("Failed to validate credentials. Please try again.");
        setLoading(false);
        return;
      }

      if (!isValid) {
        setErrorMsg("Invalid email or password.");
        setLoading(false);
        return;
      }

      // Save user session
      localStorage.setItem("user", JSON.stringify(user));

      // Redirect based on role
      if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/customer", { replace: true });
      }
    } catch (err) {
      console.error("Login error", err);
      setErrorMsg("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 py-12 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center relative z-10">
        {/* Left Side - Branding (Hidden on Mobile) */}
        <div className="hidden lg:flex flex-col justify-center items-center text-center px-8">
          <div className="mb-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 shadow-2xl transform hover:scale-105 transition-transform duration-300">
            <img src={logo} alt="CAPS UA" className="h-32 w-32 object-contain mx-auto" />
          </div>
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 mb-4 uppercase tracking-wider">CAPS UA</h1>
          <h2 className="text-3xl font-bold text-white mb-4">Welcome Back</h2>
          <p className="text-lg text-slate-300 mb-8 leading-relaxed">
            Login to your account to explore amazing products and manage your orders with ease.
          </p>
          <div className="space-y-4 text-left">
            <div className="flex items-center text-white group cursor-pointer">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mr-4 group-hover:shadow-lg group-hover:shadow-blue-500/50 transition-all duration-300 transform group-hover:scale-110">
                <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 10 10.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium group-hover:text-blue-300 transition-colors">Fast & Secure Checkout</span>
            </div>
            <div className="flex items-center text-white group cursor-pointer">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mr-4 group-hover:shadow-lg group-hover:shadow-emerald-500/50 transition-all duration-300 transform group-hover:scale-110">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 10 10.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium group-hover:text-emerald-300 transition-colors">Track Your Orders</span>
            </div>
            <div className="flex items-center text-white group cursor-pointer">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mr-4 group-hover:shadow-lg group-hover:shadow-purple-500/50 transition-all duration-300 transform group-hover:scale-110">
                <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 10 10.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium group-hover:text-pink-300 transition-colors">Exclusive Deals & Offers</span>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full max-w-sm mx-auto lg:mx-0">
          <form
            onSubmit={handleLogin}
            className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 space-y-6 border border-white/20 hover:shadow-3xl transition-shadow duration-300"
          >
            {/* Logo on Mobile */}
            <div className="lg:hidden flex justify-center mb-6">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-4">
                <img src={logo} alt="CAPS UA" className="h-16 w-16 object-contain" />
              </div>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2 uppercase tracking-wider">CAPS UA</h2>
              <p className="text-lg font-semibold text-slate-900 mb-1">Sign In</p>
              <p className="text-slate-600">Access your premium shopping account</p>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start">
                <svg className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                📧 Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 text-slate-900 placeholder-slate-400 hover:border-blue-300 duration-200"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                🔐 Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-slate-50 text-slate-900 placeholder-slate-400 hover:border-blue-300 duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M15.171 13.591l1.172 1.172a1 1 0 01-1.414 1.414l-12-12a1 1 0 011.414-1.414l12 12zM6.02 6.612l1.08 1.081A3 3 0 008.822 9.88l1.08 1.081a5 5 0 01-3.882-3.348zM15.12 3.636l-3.476 3.476a5 5 0 00-5.748 5.307l-2.539 2.54A9.963 9.963 0 0110 3c4.478 0 8.268 2.943 9.542 7-.842 1.733-1.959 3.282-3.422 4.564l-2 2a1 1 0 01-1.414-1.414l2-2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password Link */}
            <div className="text-right">
              <Link
                to="#"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium transition"
              >
                Forgot Password?
              </Link>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white font-bold rounded-xl hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/50 transform hover:scale-105 uppercase tracking-wider"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            {/* Divider */}
            <div className="relative flex items-center gap-4 my-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              <span className="text-slate-500 text-sm font-medium px-2">New to CAPS UA?</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            </div>

            {/* Register Link */}
            <Link
              to="/register"
              className="w-full py-3 border-2 border-indigo-500 text-indigo-600 font-bold rounded-xl hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-50 hover:border-indigo-600 transition duration-300 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-200 uppercase tracking-wide"
            >
              ✨ Create Account
            </Link>

            {/* Footer Text */}
            <p className="text-center text-xs text-slate-600">
              By continuing, you agree to our{" "}
              <Link to="#" className="text-blue-600 hover:underline">
                Terms of Service
              </Link>
              {" "}and{" "}
              <Link to="#" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
