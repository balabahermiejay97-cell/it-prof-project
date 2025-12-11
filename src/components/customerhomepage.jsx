// src/pages/CustomerHomePage.jsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Use publishable key from Vite env so frontend and backend use the same account
const publishableKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || "";
if (!publishableKey) console.warn("VITE_STRIPE_PUBLIC_KEY not set — Stripe Elements may not initialize correctly");
const stripePromise = loadStripe(publishableKey || "pk_test_51Sb0kCHo5FuayGoc3ktzmzdbQuKirALL7hp00tZlA77qTu5N3MuRnIb8LdxYzVeEqed2BSUz3JZKxTnwrfCqJvVp00WvYi9FRJ");

const CardPaymentForm = React.memo(function CardPaymentForm({ amountCents, onSucceeded, onFailed, userEmail = "", userName = "" }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const cardOptions = useMemo(() => ({ hidePostalCode: true }), []);

  async function handleCardPay(e) {
    e.preventDefault();
    if (!stripe || !elements) return alert("Stripe not ready");
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_STRIPE_SERVER_URL || "/api";
      const payload = { 
        amount: amountCents, 
        currency: "usd",
        email: userEmail,
        fullName: userName,
      };
      console.log("🔵 Sending to Stripe backend:", payload);
      const res = await fetch(`${apiUrl}/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.clientSecret) throw new Error(data.error || "Failed creating payment intent");

      const cardEl = elements.getElement(CardElement);
      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: cardEl },
      });

      if (result.error) {
        onFailed(result.error);
      } else if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
        onSucceeded(result.paymentIntent);
      } else {
        onFailed(new Error("Payment not completed"));
      }
    } catch (err) {
      onFailed(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCardPay} className="space-y-3">
      <div className="border rounded p-2">
        <CardElement options={cardOptions} />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={!stripe || loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading ? "Processing..." : `Pay $${(amountCents/100).toFixed(2)}`}</button>
      </div>
    </form>
  );
});

import img1 from "../assets/banner1.png";
import img2 from "../assets/banner.png";
import img3 from "../assets/banner1.png";
import logo from "../assets/logo.png";

// CustomerHomePage: main shopping UI for customers.
// - Data model (Supabase): products, product_variants, users, cart, cart_items, orders, order_items, payments, user_addresses
// - Storage buckets: 'products' (product images), 'user-avatars' (profile images)
// - This file contains React state, Supabase CRUD helpers, and small presentational components.

export default function CustomerHomePage() {
  const navigate = useNavigate();

  // user / profile
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    avatar_url: "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // products & variants
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [soldMap, setSoldMap] = useState({});

  // UI state
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Filters: arrays allow multi-select behavior
  const [sizeFilters, setSizeFilters] = useState([]);
  const [colorFilters, setColorFilters] = useState([]);
  // Filter panel / search UI toggles
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  // Derived filter options are loaded from DB so UI matches actual variants
  const [availableSizes, setAvailableSizes] = useState(["Kids", "All Fit"]);
  const [availableColors, setAvailableColors] = useState([]);
  // mobile nav for categories/sizes
  const [navOpen, setNavOpen] = useState(false);
  const CATEGORIES = ["latest", "fashion", "casual", "sports"];

  // product view modal (choose variant)
  const [viewProduct, setViewProduct] = useState(null);
  // view order details
  const [viewOrder, setViewOrder] = useState(null);

  // cart
  const [cartId, setCartId] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  // orders
  const [orders, setOrders] = useState([]);
  const [ordersOpen, setOrdersOpen] = useState(false);

  // addresses & checkout
  const [addresses, setAddresses] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Initial load: check auth, then fetch profile, products, cart, addresses, orders
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem("user"));
    if (!u) {
      navigate("/login");
      return;
    }
    setUser(u);
    loadProfile(u.id);
    loadProducts();
    ensureCart(u.id).then(() => loadCartItemsForUser(u.id));
    loadAddresses(u.id);
    loadOrders(u.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription: listen for changes to this user's orders and refresh relevant data
  useEffect(() => {
    if (!user || !user.id || !supabase) return;

    const channel = supabase
      .channel(`orders_user_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        (payload) => {
          // When an order for this user changes (update/delete/insert), reload orders and products
          console.debug("realtime orders change", payload);
          loadOrders(user.id).catch(() => {});
          // also refresh products in case stock or snapshots changed
          loadProducts().catch(() => {});
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // fallback: unsubscribe
        try { channel.unsubscribe(); } catch (err) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Debounce search/filter changes to avoid frequent server queries
  useEffect(() => {
    const t = setTimeout(() => {
      loadProducts({ search, category: categoryFilter || null, sizeFilters, colorFilters });
    }, 350);
    return () => clearTimeout(t);
  }, [search, categoryFilter, JSON.stringify(sizeFilters), JSON.stringify(colorFilters)]); // re-run when filters change
 const slides = [img1, img2, img3];

  const [current, setCurrent] = useState(0);  // Auto slide timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);
  // ------------------------
  // ------------------------
  // Profile helpers
  // ------------------------
  async function loadProfile(userId) {
    if (!userId) return;
    try {
      const { data } = await supabase.from("users").select("*").eq("id", userId).single();
      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          avatar_url: data.avatar_url || "",
        });
      }
    } catch (e) {
      console.error("loadProfile", e);
    }
  }

  /* -------------------------
    Component: OrderDetailsModal
    - Presents a single order snapshot (items, shipping, payment, totals)
    - Uses order.order_items which should already include product/variant joins and resolved image URLs
  --------------------------*/
  function OrderDetailsModal({ order, onClose }) {
    if (!order) return null;

    const statusLabel = (s) => {
      if (!s) return "unknown";
      const st = s.toLowerCase();
      if (st === "pending") return "Pending";
      if (st === "processing") return "Processing";
      if (st === "shipping" || st === "shipped") return "Shipping";
      if (st === "cancelled" || st === "canceled") return "Cancelled";
      if (st === "delivered" || st === "successful" || st === "success" || st === "completed") return "Delivered";
      return st.charAt(0).toUpperCase() + st.slice(1);
    };

    return (
      <div className="fixed inset-0 z-70 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white w-full max-w-3xl p-4 rounded shadow-lg max-h-[90vh] overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">Order Details — #{order.id?.slice(0, 8)}</h3>
            <button onClick={onClose} className="text-gray-600">Close</button>
          </div>

          <div className="mb-3 text-sm text-gray-700">
            <div><strong>Placed:</strong> {new Date(order.created_at).toLocaleString()}</div>
            <div><strong>Status:</strong> {statusLabel(order.status)}</div>
            <div><strong>Payment:</strong> {order.payment_method || "—"} • {order.payment_status || "—"}</div>
          </div>

          <div className="mb-3">
            <h4 className="font-semibold">Shipping</h4>
            <div className="text-sm text-gray-700 mt-1">
              <div>{order.shipping_full_name}</div>
              <div>{order.shipping_phone}</div>
              <div>{order.shipping_address_line}</div>
              <div>{order.shipping_city} {order.shipping_province} {order.shipping_postal_code}</div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold">Items</h4>
            <div className="mt-2 space-y-2">
              {(order.order_items || []).map((it) => (
                <div key={it.id} className="flex items-center gap-3 border rounded p-2">
                  <div className="w-16 h-16 rounded overflow-hidden bg-gray-100">
                    <img src={it.img_url || it.product_variants?.img_url || it.products?.img_url || "https://via.placeholder.com/80"} alt={it.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-gray-600">{it.color || '—'} / {it.size || '—'}</div>
                  </div>
                  <div className="text-sm font-semibold">x{it.quantity} • ${Number(it.price || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">Order ID: {order.id}</div>
            <div className="font-bold">Total: ${Number(order.total || 0).toFixed(2)}</div>
          </div>
        </div>
      </div>
    );
  }

  // Save profile and optionally upload avatar to `user-avatars` bucket
  async function saveProfile(e) {
    e.preventDefault();
    if (!user) return alert("No user");

    try {
      let avatarUrl = profile.avatar_url;

      if (avatarFile) {
        // upload to user-avatars bucket, path user.id.png
        const filePath = `${user.id}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("user-avatars")
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadErr) {
          console.error("avatar upload err", uploadErr);
          return alert("Failed uploading avatar");
        }

        const { data } = supabase.storage.from("user-avatars").getPublicUrl(filePath);
        avatarUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from("users")
        .update({
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          address: profile.address,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id);

      if (error) {
        console.error("saveProfile error", error);
        return alert("Failed saving profile");
      }

      // update local storage user (so other pages pick it up)
      localStorage.setItem("user", JSON.stringify({ ...user, full_name: profile.full_name, email: profile.email, avatar_url: avatarUrl }));
      setProfile((p) => ({ ...p, avatar_url: avatarUrl }));
      setAvatarFile(null);
      setProfileModalOpen(false);
      alert("Profile saved");
    } catch (e) {
      console.error("saveProfile", e);
      alert("Failed saving profile");
    }
  }

  // ------------------------
  // Products & Variants
  // ------------------------
  // Fetch products with their variants. Supports server-side search, category, size and color filters.
  async function loadProducts({ search: searchQ = null, category: categoryQ = null, sizeFilters: sizeQ = [], colorFilters: colorQ = [] } = {}) {
    // Refresh available sizes/colors first so the UI filters reflect the DB state
    await loadFilterOptions().catch((e) => console.debug("filter options load failed", e));
    setLoadingProducts(true);
    try {
      // select products and include product_variants (aliased as variants)
      let query = supabase.from("products").select(`*, variants:product_variants (*)`);
      // If any size/color filters are provided, derive the matching product ids from variants first
      const appliedSizes = Array.isArray(sizeQ) ? sizeQ : [];
      const appliedColors = Array.isArray(colorQ) ? colorQ : [];

      if ((appliedSizes && appliedSizes.length > 0) || (appliedColors && appliedColors.length > 0)) {
        // build variant query: variant must match selected sizes AND selected colors (if both provided)
        let variantQ = supabase.from("product_variants").select("product_id");
        if (appliedSizes && appliedSizes.length > 0) variantQ = variantQ.in("size", appliedSizes);
        if (appliedColors && appliedColors.length > 0) variantQ = variantQ.in("color", appliedColors);
        const { data: matched } = await variantQ;
        const ids = (matched || []).map((r) => r.product_id).filter(Boolean);
        // If no variants matched, short-circuit and return empty list
          if (!ids || ids.length === 0) {
          console.debug("loadProducts — variant filters returned 0 product ids", { appliedSizes, appliedColors });
          setProducts([]);
          setLoadingProducts(false);
          return;
        }
        // restrict product query to these product ids
        query = query.in("id", ids);
      }
      if (categoryQ) query = query.eq("category", categoryQ);
      if (searchQ) {
        const q = `%${searchQ.trim()}%`;
        // search on name and description (use OR)
        query = query.or(`name.ilike.${q},description.ilike.${q}`);
      }
      const { data } = await query.order("created_at", { ascending: false });

      if (data) {
        // Ensure img_url fallback and normalize variants
        const fixed = data.map((p) => ({
          ...p,
          img_url: p.img_url || "",
          variants: (p.variants || []).map((v) => ({ ...v, img_url: v.img_url || p.img_url || "" })),
        }));
        setProducts(fixed);
        // fetch sold counts for the loaded products
        try {
          const ids = fixed.map((p) => p.id).filter(Boolean);
          if (ids.length > 0) {
            const { data: soldItems } = await supabase.from("order_items").select("product_id, quantity").in("product_id", ids);
            const map = {};
            (soldItems || []).forEach((it) => { map[it.product_id] = (map[it.product_id] || 0) + Number(it.quantity || 0); });
            setSoldMap(map);
          }
        } catch (e) {
          console.debug("Failed to load sold counts", e);
        }
      } else {
        setProducts([]);
      }
    } catch (e) {
      console.error("loadProducts", e);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  // Load distinct size and color values from `product_variants` so filter UI matches DB
  async function loadFilterOptions() {
    try {
      const { data } = await supabase.from("product_variants").select("size, color");
      if (!data) return;

      const sizes = Array.from(new Set(data.map((d) => (d.size || "").trim()).filter(Boolean)));
      const colors = Array.from(new Set(data.map((d) => (d.color || "").trim()).filter(Boolean)));

      // normalize sizes: ensure common expectations for Kids/All Fit
      const normalizedSizes = sizes.length > 0 ? sizes : ["Kids", "All Fit"];
      setAvailableSizes(normalizedSizes);
      setAvailableColors(colors);
    } catch (e) {
      console.debug("loadFilterOptions failed", e);
    }
  }

  // ------------------------
  // Cart helpers
  // ------------------------
  // Ensure a `cart` row exists for user and return its id
  async function ensureCart(userId) {
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("cart").select("*").eq("user_id", userId).limit(1).single();
      if (data) {
        setCartId(data.id);
        return data.id;
      } else {
        const created = await supabase.from("cart").insert([{ user_id: userId }]).select().single();
        // supabase returns { data: {...} } sometimes; handle both
        const cid = created?.data?.id ?? created?.id ?? (created[0] && created[0].id);
        setCartId(cid);
        return cid;
      }
    } catch (e) {
      // fallback: try to create
      try {
        const created = await supabase.from("cart").insert([{ user_id: userId }]).select().single();
        const cid = created?.data?.id ?? created?.id ?? (created[0] && created[0].id);
        setCartId(cid);
        return cid;
      } catch (ee) {
        console.error("ensureCart fatal", ee);
        return null;
      }
    }
  }

  async function loadCartItemsForUser(userId) {
    if (!userId) return;
    try {
      const { data: cart } = await supabase.from("cart").select("*").eq("user_id", userId).single();
      if (!cart) {
        setCartItems([]);
        setCartCount(0);
        setCartId(null);
        return;
      }
      setCartId(cart.id);
      // Select cart_items and join product and variant
      const { data: items } = await supabase
        .from("cart_items")
        .select("*, products(*), product_variants(*)")
        .eq("cart_id", cart.id)
        .order("created_at", { ascending: true });

      const list = items || [];
      setCartItems(list);
      setCartCount(list.reduce((s, it) => s + (it.quantity || 1), 0));
    } catch (e) {
      console.error("loadCartItemsForUser", e);
    }
  }

  // Add product variant to cart (validates live stock and updates `cart_items`)
  async function addToCart(product, opts = { variantId: null, quantity: 1 }) {
    if (!user) return alert("Please log in");
    const qty = Number(opts.quantity || 1);
    // ensure cart exists
    if (!cartId) {
      await ensureCart(user.id);
    }

    // determine variant id
    let variantId = opts.variantId;
    if (!variantId) {
      const found = (product.variants || [])[0];
      if (!found) return alert("No variants available for this product");
      variantId = found.id;
    }

    if (!variantId) return alert("Select a variant");

    try {
      // verify live variant stock before adding
      const { data: variantLive, error: varErr } = await supabase.from("product_variants").select("*").eq("id", variantId).single();
      if (varErr || !variantLive) {
        console.error("variant lookup failed", varErr);
        return alert("Failed to validate variant availability");
      }
      const existingQty = (await supabase.from("cart_items").select("quantity").eq("cart_id", cartId).eq("product_variant_id", variantId).single())?.data?.quantity || 0;
      if ((existingQty || 0) + qty > Number(variantLive.stock || 0)) {
        return alert(`Not enough stock for ${product.name}. available: ${variantLive.stock}`);
      }
      // check existing cart item with same variant
      const { data: existing } = await supabase
        .from("cart_items")
        .select("*")
        .eq("cart_id", cartId)
        .eq("product_variant_id", variantId)
        .limit(1)
        .single();

      if (existing) {
        const newQty = (existing.quantity || 0) + qty;
        // double-check stock before updating
        if (newQty > Number(variantLive.stock || 0)) return alert(`Not enough stock. available: ${variantLive.stock}`);
        await supabase.from("cart_items").update({ quantity: newQty }).eq("id", existing.id);
      } else {
        await supabase.from("cart_items").insert([
          {
            cart_id: cartId,
            product_id: product.id,
            product_variant_id: variantId,
            quantity: qty,
          },
        ]);
      }

      await loadCartItemsForUser(user.id);
      setCartOpen(true);
    } catch (e) {
      console.error("addToCart", e);
      alert("Failed to add to cart");
    }
  }

  async function updateCartQty(itemId, qty) {
    try {
      if (qty <= 0) {
        await supabase.from("cart_items").delete().eq("id", itemId);
      } else {
        await supabase.from("cart_items").update({ quantity: qty }).eq("id", itemId);
      }
      await loadCartItemsForUser(user.id);
    } catch (e) {
      console.error("updateCartQty", e);
    }
  }

  async function removeCartItem(itemId) {
    try {
      await supabase.from("cart_items").delete().eq("id", itemId);
      await loadCartItemsForUser(user.id);
    } catch (e) {
      console.error("removeCartItem", e);
    }
  }

  // ------------------------
  // Orders
  // ------------------------
  // Load orders for user and attach their order_items (including product and variant info)
  async function loadOrders(userId) {
    if (!userId) return;
    try {
      const { data: ordersData } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!ordersData) {
        setOrders([]);
        return;
      }

      // For each order fetch its items (including product and variant data)
      const ordersWithItems = await Promise.all(
        ordersData.map(async (o) => {
          const { data: items } = await supabase
            .from("order_items")
            .select("*, products(*), product_variants(*)")
            .eq("order_id", o.id);
          // normalize and resolve any storage paths to public URLs
          const normalized = await Promise.all((items || []).map(async (it) => {
            let img = it.img_url || it.product_variants?.img_url || it.products?.img_url || "";
            // if img looks like a storage path (no http) and likely in products bucket, convert
            if (img && !img.startsWith("http") && supabase && typeof supabase.storage !== 'undefined') {
              try {
                const { data: publicData } = supabase.storage.from("products").getPublicUrl(img);
                img = publicData?.publicUrl || img;
              } catch (e) {
                console.debug("getPublicUrl failed", e);
              }
            }
            return {
              ...it,
              img_url: img,
            };
          }));
          return { ...o, order_items: normalized };
        })
      );

      setOrders(ordersWithItems);
    } catch (e) {
      console.error("loadOrders", e);
      setOrders([]);
    }
  }

  // Cancel an order: set status to 'cancelled' and attempt to restore variant/product stock when appropriate
  async function cancelOrder(orderId) {
    if (!orderId) return;
    const ok = window.confirm("Are you sure you want to cancel this order?");
    if (!ok) return;
    try {
      // fetch order to check status
      const { data: ord } = await supabase.from("orders").select("status").eq("id", orderId).single();
      const current = (ord?.status || "").toLowerCase();

      // allow cancel only if not shipped/delivered/cancelled already
      if (current === "cancelled" || current === "delivered" || current === "shipping") {
        return alert("This order cannot be cancelled");
      }

      // update to cancelled
      const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
      if (error) throw error;

      // Restore stock for items in this order (only if the order items exist and this cancellation hasn't already been processed)
      try {
        const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId);
        const productIdsToRecalc = new Set();

        for (const it of items || []) {
          if (!it.product_variant_id) continue;
          // fetch variant
          const { data: variant } = await supabase.from("product_variants").select("*").eq("id", it.product_variant_id).single();
          if (!variant) continue;
          const newStock = Number(variant.stock || 0) + Number(it.quantity || 0);
          await supabase.from("product_variants").update({ stock: newStock }).eq("id", variant.id);
          productIdsToRecalc.add(variant.product_id);
        }

        // recompute product totals for affected products
        for (const pid of productIdsToRecalc) {
          const { data: vars } = await supabase.from("product_variants").select("stock").eq("product_id", pid);
          const total = (vars || []).reduce((s, v) => s + Number(v.stock || 0), 0);
          await supabase.from("products").update({ stock: total }).eq("id", pid);
        }
      } catch (err) {
        // Log but don't stop; order is still cancelled
        console.warn("Failed to restore stock after cancelling order", err);
      }

      // optional: insert a payment/refund note - skipped for now

      await loadOrders(user.id);
      await loadProducts();
      alert("Order cancelled and stock restored (if applicable)");
    } catch (e) {
      console.error("cancelOrder", e);
      alert("Failed to cancel order");
    }
  }

  // ------------------------
  // Checkout: create order, snapshot items, create payment, clear cart
  // ------------------------
  async function placeOrder({ shipping_address_id = null, profile_address = null, payment_method = "cod", paymentDetails = null } = {}) {
    if (!user) return alert("No user");
    if (!cartItems || cartItems.length === 0) return alert("Cart empty");

    try {
      // 1) verify we have enough stock for every cart item (fetch live values)
      const variantChecks = await Promise.all(
        cartItems.map((ci) =>
          supabase.from("product_variants").select("*, products(*)").eq("id", ci.product_variant_id).single()
        )
      );

      for (let i = 0; i < variantChecks.length; i++) {
        const { data: variant, error } = variantChecks[i];
        const ci = cartItems[i];
        if (error || !variant) {
          console.error("Failed to fetch variant for cart item", ci, error);
          return alert("Failed to validate stock for an item. Try again.");
        }
        if ((variant.stock || 0) < (ci.quantity || 0)) {
          return alert(`Not enough stock for ${ci.products?.name || "an item"}. Available: ${variant.stock}, requested: ${ci.quantity}`);
        }
      }

      // 2) Deduct stock for each variant and recompute product stock totals
      const productIdsToRecalc = new Set();

      // Deduct variant stocks one by one
      for (let i = 0; i < cartItems.length; i++) {
        const ci = cartItems[i];
        const { data: variant } = await supabase.from("product_variants").select("*").eq("id", ci.product_variant_id).single();
        if (!variant) {
          console.error("variant missing during deduct", ci);
          continue;
        }
        const newStock = Math.max(0, (variant.stock || 0) - (ci.quantity || 0));
        await supabase.from("product_variants").update({ stock: newStock }).eq("id", variant.id);
        productIdsToRecalc.add(variant.product_id);
      }

      // recompute total stock for affected products
      for (const pid of productIdsToRecalc) {
        const { data: variantsList } = await supabase.from("product_variants").select("stock").eq("product_id", pid);
        const totalProductStock = (variantsList || []).reduce((sum, v) => sum + Number(v.stock || 0), 0);
        await supabase.from("products").update({ stock: totalProductStock }).eq("id", pid);
      }

      // 3) compute total and create order (snapshot items)
      const total = cartItems.reduce((s, it) => s + Number(it.products?.price || 0) * (it.quantity || 1), 0);

      // Prepare shipping snapshot: either use a saved address id or the profile_address passed from checkout
      let shippingSnapshot = {
        shipping_address_id: null,
        shipping_label: null,
        shipping_full_name: null,
        shipping_phone: null,
        shipping_address_line: null,
        shipping_city: null,
        shipping_province: null,
        shipping_postal_code: null,
      };

      if (shipping_address_id) {
        // fetch the chosen address to snapshot into the order
        const { data: addr } = await supabase.from("user_addresses").select("*").eq("id", shipping_address_id).single();
        if (addr) {
          shippingSnapshot = {
            shipping_address_id: addr.id,
            shipping_label: addr.label,
            shipping_full_name: addr.full_name,
            shipping_phone: addr.phone,
            shipping_address_line: addr.address_line,
            shipping_city: addr.city,
            shipping_province: addr.province,
            shipping_postal_code: addr.postal_code,
          };
        }
      } else if (profile_address) {
        shippingSnapshot = {
          ...shippingSnapshot,
          shipping_full_name: profile_address.full_name,
          shipping_phone: profile_address.phone,
          shipping_address_line: profile_address.address_line,
        };
      }

      const { data: order } = await supabase
        .from("orders")
        .insert([
          {
            user_id: user.id,
            total,
            status: "processing",
            payment_status: paymentDetails && paymentDetails.status === "succeeded" ? "paid" : "pending",
            payment_method,
            // snapshot shipping info
            shipping_address_id: shippingSnapshot.shipping_address_id,
            shipping_label: shippingSnapshot.shipping_label,
            shipping_full_name: shippingSnapshot.shipping_full_name,
            shipping_phone: shippingSnapshot.shipping_phone,
            shipping_address_line: shippingSnapshot.shipping_address_line,
            shipping_city: shippingSnapshot.shipping_city,
            shipping_province: shippingSnapshot.shipping_province,
            shipping_postal_code: shippingSnapshot.shipping_postal_code,
          },
        ])
        .select()
        .single();

      if (!order) throw new Error("order creation failed");

      const itemsPayload = cartItems.map((ci) => ({
        order_id: order.id,
        product_id: ci.product_id,
        product_variant_id: ci.product_variant_id,
        quantity: ci.quantity,
        price: ci.products?.price || 0,
        name: ci.products?.name || "",
        color: ci.product_variants?.color || "",
        size: ci.product_variants?.size || "",
        img_url: ci.product_variants?.img_url || ci.products?.img_url || "https://via.placeholder.com/100",
      }));

      await supabase.from("order_items").insert(itemsPayload);

      // 4) create payment row (include transaction id/status for card payments)
      await supabase.from("payments").insert([
        {
          order_id: order.id,
          amount: total,
          method: payment_method,
          status: paymentDetails && paymentDetails.status === "succeeded" ? "paid" : "pending",
          transaction_id: paymentDetails?.id || null,
        },
      ]);

      // 5) clear cart and refresh UI
      await supabase.from("cart_items").delete().eq("cart_id", cartId);
      await loadCartItemsForUser(user.id);
      await loadOrders(user.id);
      await loadProducts();

      setCartOpen(false);
      setCheckoutOpen(false);
      alert("Order placed successfully — stock updated.");
    } catch (e) {
      console.error("placeOrder", e);
      alert("Failed to place order");
    }
  }

  // ------------------------
  // Addresses (CRUD helpers for user addresses)
  // ------------------------
  async function loadAddresses(userId) {
    if (!userId) return;
    try {
      const { data } = await supabase.from("user_addresses").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      setAddresses(data || []);
    } catch (e) {
      console.error("loadAddresses", e);
      setAddresses([]);
    }
  }

  async function addAddress(addr) {
    if (!user) throw new Error("No user");
    // Validate required fields
    const required = ["full_name", "phone", "address_line", "city", "province", "postal_code"];
    for (const f of required) {
      if (!addr[f] || String(addr[f]).trim() === "") throw new Error(`Missing required field: ${f}`);
    }

    const { data } = await supabase.from("user_addresses").insert([{ user_id: user.id, ...addr }]).select().single();
    await loadAddresses(user.id);
    return data;
  }

  // update an existing address
  async function updateAddress(addr) {
    if (!user) throw new Error("No user");
    if (!addr?.id) throw new Error("Address id required");
    const required = ["full_name", "phone", "address_line", "city", "province", "postal_code"];
    for (const f of required) {
      if (!addr[f] || String(addr[f]).trim() === "") throw new Error(`Missing required field: ${f}`);
    }
    const { error } = await supabase.from("user_addresses").update({ ...addr }).eq("id", addr.id);
    if (error) throw error;
    await loadAddresses(user.id);
    return true;
  }

  // delete an address
  async function deleteAddress(addressId) {
    if (!user) throw new Error("No user");
    if (!addressId) throw new Error("address id required");
    const { error } = await supabase.from("user_addresses").delete().eq("id", addressId);
    if (error) throw error;
    await loadAddresses(user.id);
    return true;
  }

  // ------------------------
  // helpers / UI small utils
  // ------------------------
  const filteredProducts = products.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q);
    const matchesCategory = !categoryFilter || (p.category || "").toLowerCase() === categoryFilter.toLowerCase();

    // size filtering: if no size filters selected, accept all; otherwise product must have at least one variant matching any selected size.
    const matchesSize = (sizeFilters || []).length === 0 || (p.variants || []).some((v) => {
      const vs = (v.size || "").toLowerCase();
      return sizeFilters.some((sf) => {
        const s = (sf || "").toLowerCase();
        if (s === "kids") return vs.includes("kid");
        return vs === s;
      });
    });

    // color filtering
    const matchesColor = (colorFilters || []).length === 0 || (p.variants || []).some((v) => {
      const vc = (v.color || "").toLowerCase();
      return colorFilters.some((cf) => (cf || "").toLowerCase() === vc);
    });

    return matchesSearch && matchesCategory && matchesSize && matchesColor;
  });

  const truncate = (s = "", n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // ------------------------
  // Logout
  // ------------------------
  async function handleLogout() {
    try {
      if (supabase.auth) await supabase.auth.signOut();
    } catch (e) {}
    localStorage.removeItem("user");
    navigate("/login");
  }

  // ------------------------
  // Render
  // ------------------------
  if (!user) return <div className="p-8 text-center">Loading...</div>;

  // helpers to pick first variant image for a product card
  const productVariantImage = (p) => {
    return (p.variants && p.variants[0] && p.variants[0].img_url) || p.img_url || "https://via.placeholder.com/300";
  };

  // grouped categories for layout rows (Latest = products with category 'latest' OR newest items)
  const latestRow = products.filter((p) => (p.category || "").toLowerCase() === "latest").slice(0, 12);
  const fashionRow = products.filter((p) => (p.category || "").toLowerCase() === "fashion").slice(0, 12);
  const casualRow = products.filter((p) => (p.category || "").toLowerCase() === "casual").slice(0, 12);
  const sportsRow = products.filter((p) => (p.category || "").toLowerCase() === "sports").slice(0, 12);

  // orders counts by status
  const ordersCount = orders.length;
  const ordersByStatus = (status) => orders.filter((o) => (o.status || "").toLowerCase() === status.toLowerCase());

  return (
    <div className="min-h-screen page-bg bg-gradient-to-r from-slate-900 to-slate-500">
      {/* NAVBAR */}
      <nav className="navbar-header-main flex items-center justify-between max-w-6xl mx-auto w-full p-4 bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg shadow-md mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setCategoryFilter(""); loadProducts(); }} className="flex items-center gap-3 focus:outline-none hover:opacity-80 transition-opacity">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md flex-shrink-0">
              <img src={logo} alt="CAPS UA" className="h-8 w-8 object-contain" />
            </div>

            <div className="hidden sm:flex flex-col ml-2 truncate">
              <span className="text-sm font-semibold text-white truncate">UA Capstore</span>
              <span className="text-xs text-slate-300 truncate">Quality Caps</span>
            </div>
          </button>

          {/* desktop filter/search controls moved to the page header (Latest/product area) */}

          

        </div>

          <div className="flex items-center gap-3">
            {/* (removed mobile nav filter - filters are available in the Latest header below on all sizes) */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <button onClick={() => setProfileModalOpen(true)} className="profile-icon-button p-2 hover:bg-slate-700 rounded-lg transition-colors" title="Profile">
                <img src={profile.avatar_url || "https://via.placeholder.com/40"} alt="avatar" className="w-6 h-6 object-cover rounded-full" />
              </button>
              <span className="profile-label text-xs text-slate-300 mt-1">Profile</span>
            </div>

            <div className="flex flex-col items-center relative">
              <button onClick={() => setOrdersOpen(true)} className="orders-icon-button p-2 hover:bg-slate-700 rounded-lg transition-colors" aria-label="Open orders" title="Orders">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7h13v8H3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11h4l1 2v2" />
                  <circle cx="7.5" cy="17.5" r="1.5"/>
                  <circle cx="18.5" cy="17.5" r="1.5"/>
                </svg>
              </button>
              {ordersCount > 0 && <span className="orders-badge absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{ordersCount}</span>}
              <span className="orders-label text-xs text-slate-300 mt-1">Orders</span>
            </div>

            <div className="flex flex-col items-center relative">
              <button onClick={() => { setCartOpen((s) => !s); loadCartItemsForUser(user.id); }} className="cart-icon-button p-2 hover:bg-slate-700 rounded-lg transition-colors" aria-label="Open cart" title="Cart">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 13l-2 6m12-6 2 6" />
                  <circle cx="10" cy="19" r="1.2" fill="currentColor" />
                  <circle cx="18" cy="19" r="1.2" fill="currentColor" />
                </svg>
              </button>
              {cartCount > 0 && <span className="cart-badge absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{cartCount}</span>}
              <span className="cart-label text-xs text-slate-300 mt-1">Cart</span>
            </div>

            <div className="flex flex-col items-center">
              <button onClick={handleLogout} className="logout-button p-2 hover:bg-slate-700 rounded-lg transition-colors" title="Logout">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
              <span className="logout-label text-xs text-slate-300 mt-1">Logout</span>
            </div>
          </div>
        </div>
      </nav>
      {/* Mobile category/size menu */}
      {navOpen && (
        <div className="md:hidden bg-white border-b px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => { setCategoryFilter(""); setNavOpen(false); }}
              className={`px-2 py-1 rounded ${categoryFilter === "" ? "bg-black text-white" : "bg-gray-200"}`}
            >All</button>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => { setCategoryFilter(c); setNavOpen(false); }} className={`px-2 py-1 rounded ${categoryFilter === c ? "bg-black text-white" : "bg-gray-200"}`}>{c}</button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {availableSizes.map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                className={`text-xs px-2 py-1 rounded border ${sizeFilters.includes(s) ? 'bg-black text-white' : 'bg-gray-100'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
            <br />
     <div className="max-w-6xl mx-auto px-4 space-y-6">
      <div className="relative w-full h-56 md:h-72 overflow-hidden rounded-2xl shadow-lg">
        {/* Slides wrapper */}
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {slides.map((src, index) => (
            <div key={index} className="min-w-full h-full">
              <img
                src={src}
                className="w-full h-full object-cover"
                alt=""
              />
            </div>
          ))}
        </div>

        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrent(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                current === index
                  ? "bg-white shadow-lg scale-110"
                  : "bg-gray-400"
              }`}
            />
          ))}
        </div>
      </div>
    </div> 
<br />

      {/* Controls row - Filters + Search (visible on mobile & desktop) */}
      <div className="max-w-6xl mx-auto px-4 mb-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-white">Latest</h3>
            {categoryFilter ? <div className="text-sm text-gray-600 capitalize">{categoryFilter}</div> : null}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative">
              <button onClick={() => setFilterPanelOpen(s => !s)} className="px-3 py-1 rounded border bg-gray-100 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
                <span className="text-sm">Filters</span>
              </button>

              {filterPanelOpen && (
                <div className="absolute left-2 right-2 md:right-0 md:left-auto top-full mt-2 w-[calc(100vw-1rem)] max-w-md md:w-64 bg-white border rounded shadow-lg z-50 p-3 max-h-[70vh] overflow-auto">
                  <div className="mb-2 text-xs font-semibold text-gray-600">Categories</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button onClick={() => setCategoryFilter("")} className={`px-2 py-1 rounded border ${categoryFilter === "" ? 'bg-black text-white' : 'bg-gray-100'}`}>All</button>
                    {CATEGORIES.map((c) => (
                      <button key={c} onClick={() => setCategoryFilter(prev => prev === c ? "" : c)} className={`px-2 py-1 rounded border ${categoryFilter === c ? 'bg-black text-white' : 'bg-gray-100'}`}>{c}</button>
                    ))}
                  </div>

                  <div className="mb-2 text-xs font-semibold text-gray-600">Sizes</div>
                  <div className="flex gap-2 flex-wrap">
                    {availableSizes.map((s) => (
                      <button key={s} onClick={() => setSizeFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} className={`px-2 py-1 rounded border text-xs ${sizeFilters.includes(s) ? 'bg-black text-white' : 'bg-gray-100'}`}>{s}</button>
                    ))}
                  </div>

                  {availableColors && availableColors.length > 0 && (
                    <>
                      <div className="mt-3 mb-2 text-xs font-semibold text-gray-600">Colors</div>
                      <div className="flex gap-2 flex-wrap">
                        {availableColors.map((c) => (
                          <button key={c} onClick={() => setColorFilters(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} className={`px-2 py-1 rounded border text-xs ${colorFilters.includes(c) ? 'bg-black text-white' : 'bg-gray-100'}`}>{c}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 md:flex-none">
              <input
                className="border p-1 rounded text-sm w-full md:w-48 text-white"
                placeholder="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* MAIN - Category rows */}
      <div className="max-w-6xl mx-auto px-4 space-y-6 ">
        {/* LATEST row (horizontal scroll single-line) */}
        <SectionRow
          title="Latest"
          products={latestRow}
          onView={(p) => setViewProduct(p)}
          onAdd={(p) => addToCart(p, { quantity: 1 })}
          soldMap={soldMap}
          variantImageFn={productVariantImage}
        />

        {/* FASHION row */}
        <SectionRow
          title="Fashion"
          products={fashionRow}
          onView={(p) => setViewProduct(p)}
          onAdd={(p) => addToCart(p, { quantity: 1 })}
          soldMap={soldMap}
          variantImageFn={productVariantImage}
        />

        {/* CASUAL row */}
        <SectionRow
          title="Casual"
          products={casualRow}
          onView={(p) => setViewProduct(p)}
          onAdd={(p) => addToCart(p, { quantity: 1 })}
          soldMap={soldMap}
          variantImageFn={productVariantImage}
        />

        {/* SPORTS row */}
        <SectionRow
          title="Sports"
          products={sportsRow}
          onView={(p) => setViewProduct(p)}
          onAdd={(p) => addToCart(p, { quantity: 1 })}
          soldMap={soldMap}
          variantImageFn={productVariantImage}
        />

       
             </div>

      {/* CART DRAWER */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-full max-w-md bg-white h-full p-4 shadow-lg overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Your Cart</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setCheckoutOpen(true); }} className="px-3 py-1 bg-green-600 text-white rounded">Checkout</button>
                <button onClick={() => setCartOpen(false)} className="text-gray-600">Close</button>
              </div>
            </div>

            {cartItems.length === 0 ? (
              <div className="text-center text-gray-500">Cart is empty</div>
            ) : (
              <div className="space-y-3">
                {cartItems.map((it) => (
                  <div key={it.id} className="flex gap-3 items-start border rounded p-2">
                    <div className="w-20 h-20 overflow-hidden rounded">
                      <img src={it.product_variants?.img_url || it.products?.img_url || "https://via.placeholder.com/80"} alt={it.products?.name} className="w-full h-full object-cover" />
                    </div>

                    <div className="flex-1">
                      <div className="font-semibold">{it.products?.name}</div>
                      <div className="text-xs text-gray-600">{it.product_variants?.color || "—"} • {it.product_variants?.size || "—"}</div>
                      <div className="text-sm font-semibold text-green-700">${Number(it.products?.price || 0).toFixed(2)}</div>

                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => updateCartQty(it.id, Math.max(1, (it.quantity || 1) - 1))} className="w-8 h-8 border rounded">-</button>
                        <div className="px-2">{it.quantity}</div>
                        <button onClick={() => updateCartQty(it.id, (it.quantity || 1) + 1)} className="w-8 h-8 border rounded">+</button>

                        <button onClick={() => removeCartItem(it.id)} className="ml-auto text-sm text-red-600">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-3 border-t flex items-center justify-between">
                  <div className="font-bold">Total</div>
                  <div className="font-bold">${cartItems.reduce((s, it) => s + Number(it.products?.price || 0) * (it.quantity || 1), 0).toFixed(2)}</div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setCheckoutOpen(true); }} className="flex-1 bg-green-600 text-white rounded py-2">Checkout</button>
                  <button onClick={() => setCartOpen(false)} className="flex-1 border rounded py-2">Continue</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1" onClick={() => setCartOpen(false)} />
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {checkoutOpen && (
          <CheckoutModal
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          addresses={addresses}
          onAddAddress={addAddress}
          onUpdateAddress={updateAddress}
          onDeleteAddress={deleteAddress}
            onPlaceOrder={(opts) => placeOrder(opts)}
            cartItems={cartItems}
            total={cartItems.reduce((s, it) => s + Number(it.products?.price || 0) * (it.quantity || 1), 0)}
          user={user}
          profile={profile}
        />
      )}

      {/* PRODUCT VIEW MODAL */}
      {viewProduct && (
        <ProductViewModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onAdd={({ variantId, quantity }) => addToCart(viewProduct, { variantId, quantity })}
        />
      )}

      {/* PROFILE MODAL */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <form onSubmit={saveProfile} className="bg-white p-5 rounded space-y-3 max-w-sm w-full">
            <h2 className="text-lg font-bold">Edit Profile</h2>

            <div className="flex flex-col items-center">
              <img src={avatarFile ? URL.createObjectURL(avatarFile) : profile.avatar_url || "https://via.placeholder.com/80"} className="w-20 h-20 rounded-full border object-cover" alt="avatar" />
              <input type="file" className="mt-2" onChange={(e) => setAvatarFile(e.target.files[0])} />
            </div>

            <input type="text" placeholder="Full Name" required value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="border p-2 rounded w-full" />
            <input type="email" placeholder="Email" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="border p-2 rounded w-full" />
            <input type="tel" placeholder="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="border p-2 rounded w-full" />
            <textarea placeholder="Address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="border p-2 rounded w-full" />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setProfileModalOpen(false)} className="px-3 py-1 bg-gray-500 text-white rounded">Cancel</button>
              <button type="submit" className="px-3 py-1 bg-black text-white rounded">Save Profile</button>
            </div>
          </form>
        </div>
      )}

      {/* ORDERS MODAL */}
      {ordersOpen && (
        <OrdersModal
          open={ordersOpen}
          onClose={() => setOrdersOpen(false)}
          orders={orders}
          onCancelOrder={cancelOrder}
          onViewDetails={(o) => setViewOrder(o)}
        />
      )}

      {viewOrder && (
        <OrderDetailsModal order={viewOrder} onClose={() => setViewOrder(null)} />
      )}
    </div>
  );
}

/* -------------------------
  SectionRow: horizontal scroll row for a category
--------------------------*/
function SectionRow({ title, products = [], onView, onAdd, variantImageFn, soldMap = {} }) {
  return (
    <section className="bg-white border rounded p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">{title}</h3>
      </div>

      {products.length === 0 ? (
        <div className="text-gray-500">No items.</div>
      ) : (
        <div className="overflow-x-auto -mx-3 px-3">
          <div className="flex gap-3">
            {products.map((p) => (
              <div key={p.id} className="min-w-[200px] max-w-[220px] bg-gray-50 border rounded p-3 flex flex-col">
  
  {/* IMAGE */}
  <div className="w-full h-40 overflow-hidden rounded mb-2 cursor-pointer" onClick={() => onView(p)}>
    <img src={variantImageFn ? variantImageFn(p) : p.img_url} alt={p.name} className="w-full h-full object-cover" />
  </div>

  {/* NAME + CATEGORY */}
  <div className="font-semibold text-sm">{p.name}</div>
  <div className="text-xs text-gray-600">{p.category}</div>

  {/* DESCRIPTION */}
  <div className="text-xs text-gray-500 mt-1">
    {p.description ? (p.description.length > 60 ? p.description.slice(0, 60) + "…" : p.description) : ""}
  </div>

  {/* PRICE + VARIANT COUNT */}
  <div className="mt-2 flex items-center justify-between">
    <div className="font-semibold text-green-700">${Number(p.price).toFixed(2)}</div>
    <div className="text-xs text-gray-600">
      {p.variants?.length || 0} variants
    </div>
  </div>

  {/* ⭐ TOTAL STOCK DISPLAY */}
  <div className="text-xs text-gray-700 mt-1 space-y-1">
    <div>Total Stock: {p.variants?.reduce((sum, v) => sum + Number(v.stock), 0) || 0}</div>
    <div>Sold: {soldMap[p.id] || 0}</div>
  </div>


    

  {/* BUTTONS */}
  <div className="mt-3 flex gap-2">
    <button onClick={() => onView(p)} className="flex-1 border rounded py-1 text-sm">View</button>
    <button onClick={() => onAdd(p)} className="flex-1 bg-blue-600 text-white rounded py-1 text-sm">Add</button>
  </div>
</div>

            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------
  Product card used in grid (simple)
--------------------------*/
function ProductCard({ p, onView, onAdd, variantImageFn }) {
  return (
    <div className="bg-white border rounded shadow p-3 flex flex-col">
      <div className="w-full h-40 overflow-hidden rounded mb-2 cursor-pointer" onClick={onView}>
        <img src={variantImageFn ? variantImageFn(p) : p.img_url} alt={p.name} className="w-full h-full object-cover" />
      </div>

      <div className="font-bold text-sm">{p.name}</div>
      <div className="text-xs text-gray-600">{p.category}</div>
      <div className="text-xs text-gray-500 mt-1">{p.description ? (p.description.length > 80 ? p.description.slice(0, 80) + "…" : p.description) : ""}</div>

      <div className="mt-2 flex items-center justify-between">
        <div className="font-semibold text-green-700">${Number(p.price).toFixed(2)}</div>
        <div className="text-xs text-gray-600">Variants: {(p.variants || []).length}</div>
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={onView} className="flex-1 border rounded py-2 text-sm">View</button>
        <button onClick={onAdd} className="flex-1 bg-blue-600 text-white rounded py-2 text-sm">Add</button>
      </div>
    </div>
  );
}

/* -------------------------
  ProductViewModal component
  - shows variants, picks one by id, picks qty
  - swapping variant updates main image
--------------------------*/
function ProductViewModal({ product, onClose, onAdd }) {
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const [mainImg, setMainImg] = useState(product.img_url || (product.variants && product.variants[0] && product.variants[0].img_url) || "");
  const [soldCount, setSoldCount] = useState(0);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (product) {
      const first = (product.variants || [])[0];
      setVariantId(first ? first.id : null);
      setQty(1);
      setMainImg(product.img_url || (first && first.img_url) || "");
    }
  }, [product]);

  useEffect(() => {
    if (!product || !product.id) return;
    let mounted = true;
    async function loadMeta() {
      try {
        // Sold count from order_items (sum quantities)
        const { data: items } = await supabase.from("order_items").select("quantity").eq("product_id", product.id);
        const total = (items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
        if (mounted) setSoldCount(total);
      } catch (e) {
        console.debug("Failed to load sold count", e);
      }

      try {
        // Product reviews table (optional)
        const { data: rev } = await supabase
          .from("product_reviews")
          .select(`id, rating, comment, created_at, users (full_name, avatar_url)`)
          .eq("product_id", product.id)
          .order("created_at", { ascending: false });
        if (mounted) setReviews(rev || []);
      } catch (e) {
        // If table doesn't exist, ignore
        console.debug("No product_reviews table or failed to load reviews", e);
      }
    }
    loadMeta();
    return () => { mounted = false; };
  }, [product]);

  useEffect(() => {
    // when variantId changes, update mainImg to that variant's img
    if (!product || !product.variants) return;
    const v = product.variants.find((x) => x.id === variantId);
    if (v && v.img_url) setMainImg(v.img_url);
  }, [variantId, product]);

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white w-full max-w-3xl p-4 rounded shadow-lg grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 flex items-center justify-center">
          <div className="w-full h-64 overflow-hidden rounded">
            <img src={mainImg || "https://via.placeholder.com/300"} alt={product.name} className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="md:col-span-2 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{product.name}</h2>
              <p className="text-sm text-gray-600 mt-1">{product.category}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-green-700">${Number(product.price).toFixed(2)}</div>
            </div>
          </div>

          <div className="mt-3">
            <h3 className="font-semibold">Description</h3>
            <p className="text-sm text-gray-700 mt-1">{product.description || "No description available."}</p>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <div className="text-sm text-gray-600">Sold:</div>
            <div className="font-semibold">{soldCount}</div>
            <div className="ml-4 text-sm text-gray-600">Rating:</div>
            <div className="flex items-center gap-1">
              {reviews.length === 0 ? (
                <span className="text-sm text-gray-500">No ratings</span>
              ) : (
                (() => {
                  const avg = (reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length) || 0;
                  const full = Math.round(avg);
                  return (
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg key={i} className={`w-4 h-4 ${i < full ? 'text-yellow-400' : 'text-gray-300'}`} viewBox="0 0 20 20" fill={i < full ? 'currentColor' : 'none'} stroke="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.973a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.385 2.46a1 1 0 00-.364 1.118l1.287 3.973c.3.921-.755 1.688-1.54 1.118l-3.385-2.46a1 1 0 00-1.175 0l-3.385 2.46c-.784.57-1.838-.197-1.539-1.118l1.287-3.973a1 1 0 00-.364-1.118L2.045 9.4c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.973z"/></svg>
                      ))}
                      <span className="text-sm text-gray-600 ml-1">{(reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / (reviews.length || 1)).toFixed(1)}</span>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Variant</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(product.variants || []).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setVariantId(v.id);
                      if (v.img_url) setMainImg(v.img_url);
                    }}
                    className={`text-left p-2 border rounded ${variantId === v.id ? "ring-2 ring-blue-500" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 overflow-hidden rounded">
                        <img src={v.img_url || product.img_url || "https://via.placeholder.com/80"} alt={`${v.color} ${v.size}`} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="font-medium">{v.color} • {v.size}</div>
                        <div className="text-xs text-gray-600">Stock: {v.stock}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 border rounded">-</button>
                <input type="number" className="w-16 text-center border rounded p-1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))} />
                <button onClick={() => setQty((q) => q + 1)} className="w-8 h-8 border rounded">+</button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                if (!variantId) return alert("Choose a variant");
                onAdd({ variantId, quantity: qty });
                onClose();
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Add to cart
            </button>
            <button onClick={onClose} className="px-4 py-2 border rounded">Close</button>
          </div>

          {/* Reviews list */}
          <div className="mt-4">
            <h4 className="font-semibold">Reviews ({reviews.length})</h4>
            <div className="mt-2 space-y-3 max-h-40 overflow-y-auto">
              {reviews.length === 0 && <div className="text-sm text-gray-500">Be the first to review this product.</div>}
              {reviews.map((rv) => (
                <div key={rv.id} className="p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded overflow-hidden bg-gray-100">
                      <img src={rv.users?.avatar_url || 'https://via.placeholder.com/40'} alt={rv.users?.full_name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{rv.users?.full_name || 'Anonymous'}</div>
                      <div className="text-xs text-gray-500">{new Date(rv.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-sm font-semibold">{rv.rating}★</div>
                  </div>
                  {rv.comment && <div className="mt-2 text-sm text-gray-700">{rv.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------
  CheckoutModal component
--------------------------*/
function CheckoutModal({ open, onClose, addresses = [], onAddAddress, onUpdateAddress, onDeleteAddress, onPlaceOrder, user, profile, cartItems = [], total = 0 }) {
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [paymentOption, setPaymentOption] = useState("cod");
  const [newAddr, setNewAddr] = useState({
    label: "Home",
    full_name: user?.full_name || profile.full_name || "",
    phone: user?.phone || profile.phone || "",
    address_line: profile.address || "",
    city: "",
    province: "",
    postal_code: "",
  });

  useEffect(() => {
    setSelected(addresses[0] || null);
    console.log("🟡 CheckoutModal opened - user:", user, "profile:", profile);
  }, [addresses, open]);

  if (!open) return null;

  

  async function handleSave() {
    setCreating(true);
    try {
      // client-side validation
      const required = ["full_name", "phone", "address_line", "city", "province", "postal_code"];
      for (const f of required) {
        if (!newAddr[f] || String(newAddr[f]).trim() === "") throw new Error("Please complete all address fields.");
      }

      if (editingId) {
        // updating existing
        await onUpdateAddress({ id: editingId, ...newAddr });
        setEditingId(null);
      } else {
        await onAddAddress(newAddr);
      }

      setNewAddr({ label: "Home", full_name: user?.full_name || "", phone: "", address_line: "", city: "", province: "", postal_code: "" });
      setCreating(false);
    } catch (e) {
      setCreating(false);
      const msg = e?.message || "Failed to save address";
      alert(msg);
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white w-full max-w-lg md:max-w-3xl p-4 rounded shadow-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Checkout</h3>
          <button onClick={onClose} className="text-gray-600">Close</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2">Select shipping address</h4>

            <div className="space-y-2">
              {addresses.map((a) => (
                <div key={a.id} className={`block p-3 border rounded ${selected?.id === a.id ? "ring-2 ring-blue-500" : ""}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-grow">
                      <label className="flex items-center gap-2">
                        <input type="radio" name="addr" checked={selected?.id === a.id} onChange={() => setSelected(a)} className="mr-2" />
                        <div>
                          <div className="font-semibold">{a.label || "Address"}</div>
                          <div className="text-xs text-gray-600">{a.address_line} {a.city}</div>
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center gap-2 ml-2">
                      <button onClick={() => { setEditingId(a.id); setNewAddr({ label: a.label || "", full_name: a.full_name || "", phone: a.phone || "", address_line: a.address_line || "", city: a.city || "", province: a.province || "", postal_code: a.postal_code || "" }); }} className="px-2 py-1 text-xs border rounded">Edit</button>
                      <button onClick={async () => {
                        const ok = window.confirm("Delete this address?");
                        if (!ok) return;
                        try { await onDeleteAddress(a.id); if (selected?.id === a.id) setSelected(null); } catch (e) { alert("Failed to delete address"); }
                      }} className="px-2 py-1 text-xs border rounded text-red-600">Delete</button>
                    </div>
                  </div>
                </div>
              ))}

              <label className={`block p-3 border rounded ${selected?.id === "profile" ? "ring-2 ring-blue-500" : ""}`}>
                <input type="radio" name="addr" checked={selected?.id === "profile"} onChange={() => setSelected({ id: "profile" })} className="mr-2" />
                <div className="font-semibold">Use profile address</div>
                <div className="text-xs text-gray-600">{profile.address}</div>
              </label>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Add new address</h4>

            <input className="w-full border rounded p-2 mb-2" placeholder="Label (Home, Work)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} />
            <input className="w-full border rounded p-2 mb-2" placeholder="Full name" value={newAddr.full_name} onChange={(e) => setNewAddr({ ...newAddr, full_name: e.target.value })} />
            <input className="w-full border rounded p-2 mb-2" placeholder="Phone" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} />
            <input className="w-full border rounded p-2 mb-2" placeholder="Address line" value={newAddr.address_line} onChange={(e) => setNewAddr({ ...newAddr, address_line: e.target.value })} />
            <input className="w-full border rounded p-2 mb-2" placeholder="City" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} />
            <input className="w-full border rounded p-2 mb-2" placeholder="Province" value={newAddr.province} onChange={(e) => setNewAddr({ ...newAddr, province: e.target.value })} />
            <input className="w-full border rounded p-2 mb-2" placeholder="Postal / ZIP" value={newAddr.postal_code} onChange={(e) => setNewAddr({ ...newAddr, postal_code: e.target.value })} />

            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <button onClick={handleSave} disabled={creating} className="w-full sm:flex-1 bg-black text-white rounded py-2">{creating ? "Saving..." : (editingId ? "Update Address" : "Save Address")}</button>
              {editingId && (
                <button onClick={() => { setEditingId(null); setNewAddr({ label: "Home", full_name: user?.full_name || "", phone: "", address_line: "", city: "", province: "", postal_code: "" }) }} className="w-full sm:w-auto px-3 py-1 border rounded">Cancel</button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold mb-2">Payment</h4>
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2"><input type="radio" name="pay" checked={paymentOption === 'cod'} onChange={() => setPaymentOption('cod')} /> Cash on Delivery</label>
            <label className="flex items-center gap-2"><input type="radio" name="pay" checked={paymentOption === 'card'} onChange={() => setPaymentOption('card')} /> Stripe Card (Test)</label>
          </div>

          {paymentOption === 'card' ? (
            <div className="mb-3">
              <Elements stripe={stripePromise}>
                <CardPaymentForm
                  amountCents={Math.round((total || 0) * 100)}
                  userEmail={user?.email || profile?.email || ""}
                  userName={user?.full_name || profile?.full_name || ""}
                  onSucceeded={async (paymentIntent) => {
                    try {
                      // determine shipping selection
                      if (!selected) return alert('Select or add an address');
                      if (selected.id === 'profile') {
                        const profileAddress = { full_name: profile.full_name, phone: profile.phone, address_line: profile.address };
                        await onPlaceOrder({ profile_address: profileAddress, payment_method: 'card', paymentDetails: { id: paymentIntent.id, status: paymentIntent.status } });
                      } else {
                        await onPlaceOrder({ shipping_address_id: selected.id, payment_method: 'card', paymentDetails: { id: paymentIntent.id, status: paymentIntent.status } });
                      }
                      onClose();
                      alert('Payment succeeded and order placed');
                    } catch (err) {
                      console.error('post-payment placeOrder', err);
                      alert('Payment succeeded but failed to create order');
                    }
                  }}
                  onFailed={(err) => { alert(err?.message || 'Payment failed'); }}
                />
              </Elements>
            </div>
          ) : (
            <div className="mt-4 flex flex-col sm:flex-row justify-end gap-2">
              <button onClick={onClose} className="w-full sm:w-auto px-4 py-2 border rounded">Cancel</button>
              <button onClick={() => {
                if (!selected) return alert("Select or add an address");
                if (selected.id === "profile") {
                  const profileAddress = { full_name: profile.full_name, phone: profile.phone, address_line: profile.address };
                  onPlaceOrder({ profile_address: profileAddress, payment_method: "cod" });
                } else {
                  onPlaceOrder({ shipping_address_id: selected.id, payment_method: "cod" });
                }
              }} className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded">Place Order (COD)</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------
  OrdersModal: shows user's orders grouped by status
  - displays item images
  - has Cancel button (if allowed)
  - shows simple status step UI: processing -> shipping -> delivered
--------------------------*/
function OrdersModal({ open, onClose, orders = [], onCancelOrder, onViewDetails }) {
  if (!open) return null;

  // Helper to format status label
  const statusLabel = (s) => {
    if (!s) return "unknown";
    const st = s.toLowerCase();
    if (st === "pending") return "Pending";
    if (st === "processing") return "Processing";
    if (st === "shipping" || st === "shipped") return "Shipping";
    if (st === "cancelled" || st === "canceled") return "Cancelled";
    if (st === "delivered" || st === "successful" || st === "success" || st === "completed") return "Delivered";
    return st.charAt(0).toUpperCase() + st.slice(1);
  };

  // Determine step index for status stepper (0-based)
  const statusStepIndex = (s) => {
    if (!s) return 0;
    const st = s.toLowerCase();
    if (st === "processing" || st === "pending") return 0;
    if (st === "shipping" || st === "shipped") return 1;
    if (st === "delivered" || st === "successful" || st === "success" || st === "completed") return 2;
    if (st === "cancelled" || st === "canceled") return -1; // cancelled special
    return 0;
  };

  // Show small pills for allowed cancel
  const canCancel = (s) => {
    const st = (s || "").toLowerCase();
    // allow cancel only if not shipping/delivered/cancelled
    return st !== "shipping" && st !== "delivered" && st !== "cancelled" && st !== "canceled";
  };

  const orderStatuses = ["processing", "shipping", "cancelled", "delivered"]; // for header counts

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white w-full max-w-5xl p-4 rounded shadow-lg overflow-auto max-h-[85vh]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Your Orders</h3>
          <button onClick={onClose} className="text-gray-600">Close</button>
        </div>

        {orders.length === 0 ? (
          <div className="text-center text-gray-500">You have no orders yet.</div>
        ) : (
          <div className="space-y-4">
            {orderStatuses.map((stKey) => (
              <div key={stKey}>
                <h4 className="font-semibold capitalize mb-2">{stKey === "processing" ? "Processing" : stKey === "shipping" ? "Shipping" : stKey === "cancelled" ? "Cancelled" : "Delivered"} ({orders.filter(o => {
                  const s = (o.status || "").toLowerCase();
                  if (stKey === "processing") return s === "processing" || s === "pending";
                  if (stKey === "shipping") return s === "shipping" || s === "shipped";
                  if (stKey === "cancelled") return s === "cancelled" || s === "canceled";
                  if (stKey === "delivered") return s === "delivered" || s === "successful" || s === "success" || s === "completed";
                  return false;
                }).length})</h4>

                <div className="space-y-2">
                  {orders.filter(o => {
                    const s = (o.status || "").toLowerCase();
                    if (stKey === "processing") return s === "processing" || s === "pending";
                    if (stKey === "shipping") return s === "shipping" || s === "shipped";
                    if (stKey === "cancelled") return s === "cancelled" || s === "canceled";
                    if (stKey === "delivered") return s === "delivered" || s === "successful" || s === "success" || s === "completed";
                    return false;
                  }).map((o) => (
                    <div key={o.id} className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-semibold">Order #{o.id?.slice(0, 8)}</div>
                          <div className="text-xs text-gray-600">Placed: {new Date(o.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">${Number(o.total).toFixed(2)}</div>
                          <div className="text-xs text-gray-600">{statusLabel(o.status)}</div>
                        </div>
                      </div>

                      {/* Status stepper */}
                      <div className="mb-3">
                        {o.status && (o.status.toLowerCase() === "cancelled" || o.status.toLowerCase() === "canceled") ? (
                          <div className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded">Cancelled</div>
                        ) : (
                          <div className="flex items-center gap-3 text-xs">
                            <div className={`flex items-center gap-2 ${statusStepIndex(o.status) >= 0 ? "" : "opacity-60"}`}>
                              <div className={`w-3 h-3 rounded-full ${statusStepIndex(o.status) >= 0 ? "bg-blue-600" : "bg-gray-300"}`} />
                              <div>Processing</div>
                            </div>

                            <div className="w-8 h-[1px] bg-gray-200" />

                            <div className={`flex items-center gap-2 ${statusStepIndex(o.status) >= 1 ? "" : "opacity-60"}`}>
                              <div className={`w-3 h-3 rounded-full ${statusStepIndex(o.status) >= 1 ? "bg-blue-600" : "bg-gray-300"}`} />
                              <div>Shipping</div>
                            </div>

                            <div className="w-8 h-[1px] bg-gray-200" />

                            <div className={`flex items-center gap-2 ${statusStepIndex(o.status) >= 2 ? "" : "opacity-60"}`}>
                              <div className={`w-3 h-3 rounded-full ${statusStepIndex(o.status) >= 2 ? "bg-blue-600" : "bg-gray-300"}`} />
                              <div>Delivered</div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-sm">
                        <strong>Items:</strong>
                        <div className="mt-2 space-y-2 ml-2">
                          {(o.order_items || []).map((it) => (
                            <div key={it.id} className="flex items-center gap-3">
                              <div className="w-14 h-14 bg-gray-100 rounded overflow-hidden">
                                <img src={it.img_url || it.product_variants?.img_url || it.products?.img_url || "https://via.placeholder.com/80"} alt={it.name} className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <div className="font-medium text-sm">{it.name}</div>
                                <div className="text-xs text-gray-600">{it.color || "—"} / {it.size || "—"} • x{it.quantity}</div>
                              </div>
                              <div className="ml-auto text-sm font-semibold">${Number(it.price || 0).toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        {canCancel(o.status) && (
                          <button onClick={() => onCancelOrder(o.id)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Cancel Order</button>
                        )}

                        {/* Optional: View details / track */}
                        <button onClick={() => onViewDetails && onViewDetails(o)} className="px-3 py-1 border rounded text-sm">View Details</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
