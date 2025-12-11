// src/components/ProductPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

/**
 * ProductPage.jsx
 * - Loads a product by :id
 * - Shows image, name, description, category, color, size, price, stock
 * - Quantity picker (min 1, max = stock)
 * - Add to cart (persists to localStorage 'cart')
 * - Black / gray / white minimalist theme
 */

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadProduct = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Failed to load product:", error);
        setProduct(null);
      } else {
        setProduct(data);
        // ensure qty default within stock
        if (data?.stock && qty > data.stock) setQty(Math.max(1, data.stock));
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  const changeQty = (value) => {
    if (!product) return;
    const max = product.stock || 9999;
    const next = Math.max(1, Math.min(max, value));
    setQty(next);
  };

  const handleAddToCart = () => {
    if (!product) return;
    const max = product.stock || 9999;
    if (qty < 1) return alert("Quantity must be at least 1.");
    if (qty > max) return alert(`Only ${max} left in stock.`);

    setAdding(true);

    try {
      const raw = localStorage.getItem("cart");
      const existing = raw ? JSON.parse(raw) : [];

      // merge or append
      const idx = existing.findIndex((i) => i.id === product.id);
      if (idx >= 0) {
        existing[idx].quantity = Math.min(max, (existing[idx].quantity || 1) + qty);
      } else {
        existing.push({
          id: product.id,
          name: product.name,
          price: product.price,
          img_url: product.img_url,
          quantity: qty,
        });
      }

      localStorage.setItem("cart", JSON.stringify(existing));
      // Optionally sync with server/cart endpoint later
      alert(`${product.name} (${qty}) added to cart.`);
    } catch (err) {
      console.error("Error adding to cart:", err);
      alert("Failed to add to cart.");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-600">Loading product...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-xl text-center">
          <h2 className="text-xl font-semibold text-gray-800">Product not found</h2>
          <p className="text-sm text-gray-500 mt-2">This product may have been removed.</p>
          <div className="mt-4">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-gray-800 text-white rounded"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Page layout: left image, right details on md+, stacked on mobile
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
          {/* IMAGE */}
          <div className="md:col-span-1 flex items-center justify-center">
            <div className="w-full h-72 md:h-96 overflow-hidden rounded border">
              <img
                src={product.img_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* DETAILS */}
          <div className="md:col-span-2 flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">{product.name}</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {product.category ? product.category.charAt(0).toUpperCase() + product.category.slice(1) : ""}
                  {product.color ? ` • ${product.color}` : ""}{product.size ? ` • ${product.size}` : ""}
                </p>
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">${product.price}</div>
                <div className="text-sm text-gray-500 mt-1">Stock: {product.stock ?? 0}</div>
              </div>
            </div>

            {/* Description box — not too far from title, boxed to look neat */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">Description</h3>
              <div className="bg-gray-100 text-gray-700 p-4 rounded-md leading-relaxed max-h-44 overflow-auto">
                {product.description || "No description available."}
              </div>
            </div>

            {/* Quantity + Add to Cart */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeQty(qty - 1)}
                  className="w-9 h-9 flex items-center justify-center border rounded text-gray-800"
                >
                  -
                </button>
                <input
                  type="number"
                  className="w-20 text-center border rounded p-1"
                  value={qty}
                  min={1}
                  max={product.stock || 9999}
                  onChange={(e) => {
                    const v = parseInt(e.target.value || "1", 10);
                    if (!isNaN(v)) changeQty(v);
                  }}
                />
                <button
                  onClick={() => changeQty(qty + 1)}
                  className="w-9 h-9 flex items-center justify-center border rounded text-gray-800"
                >
                  +
                </button>
              </div>

              <div className="mt-3 sm:mt-0 sm:ml-auto flex gap-2">
                <button
                  onClick={handleAddToCart}
                  disabled={adding}
                  className="px-4 py-2 bg-black text-white rounded hover:opacity-95 disabled:opacity-60"
                >
                  {adding ? "Adding..." : `Add to Cart (${qty})`}
                </button>

                <button
                  onClick={() => navigate("/customer")}
                  className="px-4 py-2 border rounded text-gray-800"
                >
                  Back to Shop
                </button>
              </div>
            </div>

            {/* Extra: small details area */}
            <div className="mt-6 text-sm text-gray-500">
              <div>SKU: {product.id}</div>
              <div className="mt-1">Added: {new Date(product.created_at).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
