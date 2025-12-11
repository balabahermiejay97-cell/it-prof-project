// src/components/landing.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Menu, X, Truck, Shield, Headphones, Zap } from "lucide-react";
import { supabase } from "../supabaseClient";
import logo from "../assets/logo.png";

export default function Landing() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);

  // Fetch stats from Supabase
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Count registered customers (role = 'customer')
        const { count: custCount, error: custError } = await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("role", "customer");

        if (custError) {
          console.error("Error fetching customer count:", custError);
        }

        // Count all products in the products table
        const { count: prodCount, error: prodError } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true });

        if (prodError) {
          console.error("Error fetching product count:", prodError);
        }

        console.log("Customer count:", custCount, "Product count:", prodCount);

        setCustomerCount(custCount || 0);
        setProductCount(prodCount || 0);
      } catch (error) {
        console.error("Error fetching stats:", error);
        // Fallback values - comment out if you don't want fallback
        // setCustomerCount(10000);
        // setProductCount(5000);
      }
    };

    fetchStats();
  }, []);

  // Simulate loading for 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-600 to-emerald-600 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-white rounded-full flex items-center justify-center animate-bounce">
            <ShoppingCart className="w-10 h-10 text-teal-600" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">CAPS UA</h1>
          <p className="text-white/80 mb-8">Loading your shopping experience...</p>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-10 bg-white/30 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* NAVIGATION */}
      <nav className="sticky top-0 z-50 bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md flex-shrink-0">
                <img src={logo} alt="CAPS UA" className="h-8 w-8 object-contain" />
              </div>
              <span className="hidden sm:inline text-xl font-bold text-teal-600">CAPS UA</span>
            </div>

            {/* Desktop Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-teal-600 transition">Features</a>
              <a href="#about" className="text-gray-600 hover:text-teal-600 transition">About</a>
              <button
                onClick={() => navigate("/login")}
                className="px-4 py-2 text-teal-600 hover:bg-teal-50 rounded-lg transition"
              >
                Login
              </button>
              <button
                onClick={() => navigate("/register")}
                className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-semibold"
              >
                Sign Up
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-600" />
              ) : (
                <Menu className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4 border-t">
              <div className="flex flex-col gap-3 pt-4">
                <a href="#features" className="text-gray-600 hover:text-teal-600 px-4 py-2">Features</a>
                <a href="#about" className="text-gray-600 hover:text-teal-600 px-4 py-2">About</a>
                <button
                  onClick={() => {
                    navigate("/login");
                    setMobileMenuOpen(false);
                  }}
                  className="px-4 py-2 text-teal-600 hover:bg-teal-50 rounded-lg transition text-left"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    navigate("/register");
                    setMobileMenuOpen(false);
                  }}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-semibold"
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-teal-50 to-emerald-50">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
              Welcome to <span className="text-teal-600">CAPS UA</span>
            </h1>
            <p className="text-xl text-gray-600">
              Discover the best selection of quality caps, apparel, and accessories. Shop from thousands of products with fast delivery and amazing customer service.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                onClick={() => navigate("/register")}
                className="px-8 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-semibold text-lg shadow-md hover:shadow-lg"
              >
                Get Started
              </button>
              <button
                onClick={() => navigate("/login")}
                className="px-8 py-3 border-2 border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 transition font-semibold text-lg"
              >
                Sign In
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-teal-600">
                  {customerCount > 0 ? customerCount >= 1000 ? `${(customerCount / 1000).toFixed(1)}K+` : customerCount.toLocaleString() : "0"}
                </div>
                <div className="text-sm text-gray-600">Happy Customers</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-600">
                  {productCount > 0 ? productCount >= 1000 ? `${(productCount / 1000).toFixed(1)}K+` : productCount.toLocaleString() : "0"}
                </div>
                <div className="text-sm text-gray-600">Products</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-cyan-600">24/7</div>
                <div className="text-sm text-gray-600">Support</div>
              </div>
            </div>
          </div>

          {/* Right Image */}
          <div className="relative hidden md:block">
            <div className="bg-gradient-to-br from-teal-100 to-emerald-100 rounded-2xl p-8 shadow-xl">
              <ShoppingCart className="w-32 h-32 text-teal-600 mx-auto mb-6 opacity-80" />
              <h3 className="text-2xl font-bold text-center text-gray-900 mb-6">Why Shop With Us?</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Easy Shopping</h4>
                    <p className="text-sm text-gray-600">Browse and buy with ease</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Fast Checkout</h4>
                    <p className="text-sm text-gray-600">Quick and secure payment</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-cyan-600 rounded-full flex items-center justify-center text-white font-bold">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Community</h4>
                    <p className="text-sm text-gray-600">Join thousands of happy users</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">Why Choose CAPS UA</h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Everything you need for a seamless shopping experience
          </p>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { 
                icon: ShoppingCart,
                title: "Wide Selection", 
                desc: `Browse from ${productCount > 0 ? productCount.toLocaleString() : "5000+"} quality products`
              },
              { 
                icon: Truck,
                title: "Fast Delivery", 
                desc: "Quick shipping straight to your doorstep" 
              },
              { 
                icon: Shield,
                title: "Secure Checkout", 
                desc: "Safe and encrypted payment processing" 
              },
              { 
                icon: Headphones,
                title: "24/7 Support", 
                desc: "Always here to help with any questions" 
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="p-6 bg-white border border-gray-200 rounded-xl hover:shadow-lg transition hover:border-teal-300">
                  <Icon className="w-10 h-10 text-teal-600 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">About CAPS UA</h2>
              <p className="text-lg text-gray-600 mb-4">
                CAPS UA is your ultimate destination for premium caps, apparel, and accessories. 
                We've built a thriving community of over {customerCount > 0 ? customerCount.toLocaleString() : "thousands of"} satisfied customers worldwide.
              </p>
              <p className="text-lg text-gray-600 mb-6">
                Our mission is to provide high-quality products at competitive prices with exceptional 
                customer service. Every product in our collection is carefully curated to ensure the best 
                shopping experience for our valued customers.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-teal-600 text-white">
                      <Zap className="w-6 h-6" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Quality Assurance</h3>
                    <p className="text-gray-600">Every product meets strict quality standards</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-600 text-white">
                      <Truck className="w-6 h-6" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Fast Shipping</h3>
                    <p className="text-gray-600">Reliable delivery to your location</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-cyan-600 text-white">
                      <Shield className="w-6 h-6" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Buyer Protection</h3>
                    <p className="text-gray-600">Safe transactions with money-back guarantee</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Stats */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-teal-50 to-emerald-50 p-8 rounded-2xl border border-teal-200">
                <div className="text-5xl font-bold text-teal-600 mb-2">
                  {customerCount > 0 ? customerCount.toLocaleString() : "0"}
                </div>
                <p className="text-xl text-gray-700 font-semibold">Happy Customers</p>
                <p className="text-gray-600 mt-2">Join our growing community of satisfied shoppers</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 p-8 rounded-2xl border border-emerald-200">
                <div className="text-5xl font-bold text-emerald-600 mb-2">
                  {productCount > 0 ? productCount.toLocaleString() : "0"}
                </div>
                <p className="text-xl text-gray-700 font-semibold">Quality Products</p>
                <p className="text-gray-600 mt-2">Carefully selected and verified items</p>
              </div>

              <div className="bg-gradient-to-br from-cyan-50 to-blue-50 p-8 rounded-2xl border border-cyan-200">
                <div className="text-5xl font-bold text-cyan-600 mb-2">100%</div>
                <p className="text-xl text-gray-700 font-semibold">Satisfaction Guaranteed</p>
                <p className="text-gray-600 mt-2">Full refund if you're not completely satisfied</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="bg-teal-600 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Start Shopping?</h2>
          <p className="text-lg text-white/90 mb-8">Join thousands of satisfied customers today</p>
          <button
            onClick={() => navigate("/register")}
            className="px-10 py-4 bg-white text-teal-600 rounded-lg hover:bg-gray-100 transition font-bold text-lg shadow-lg"
          >
            Get Started Now
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="w-6 h-6 text-teal-400" />
              <span className="text-white font-bold text-lg">CAPS UA</span>
            </div>
            <p className="text-sm">Your trusted shopping destination for quality caps and apparel</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Products</a></li>
              <li><a href="#" className="hover:text-white transition">Categories</a></li>
              <li><a href="#" className="hover:text-white transition">Deals</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Help Center</a></li>
              <li><a href="#" className="hover:text-white transition">Contact</a></li>
              <li><a href="#" className="hover:text-white transition">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Privacy</a></li>
              <li><a href="#" className="hover:text-white transition">Terms</a></li>
              <li><a href="#" className="hover:text-white transition">Cookies</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 text-center text-sm">
          <p>&copy; 2025 CAPS UA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
