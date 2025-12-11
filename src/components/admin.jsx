import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

// Allowed sizes and colors for product variants used by the admin UI.
// These are UI constraints and should match the options expected by the DB/schema.
const AVAILABLE_SIZES = ["Kids", "All Fit"];
const AVAILABLE_COLORS = ["Red", "Black", "White", "Blue", "Green", "Gray"];

export default function Admin() {
  const navigate = useNavigate();

  // Top-level state: products, orders, UI state and currently editing objects
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [viewOrder, setViewOrder] = useState(null); // order shown in modal
  const [tab, setTab] = useState("products"); // 'products' | 'orders'
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);

  // New product being composed by admin, holds variants array
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: "",
    category: "latest",
    variants: [], // variant objects: { id|null, color, size, stock, imgFile?, img_url }
  });

  // Temporary inputs for adding a single variant in the forms
  const [newVariant, setNewVariant] = useState({
    color: AVAILABLE_COLORS[0],
    size: AVAILABLE_SIZES[1],
    stock: "",
    imgFile: null,
    img_url: "",
  });

  // ------------------
  // Profile / Auth handling for admin
  // ------------------
  const [user, setUser] = useState(null);
  const [profileModal, setProfileModal] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", email: "", phone: "", address: "", avatar_url: "" });
  const [avatarFile, setAvatarFile] = useState(null);

  // Load profile from localStorage and ensure user role is admin
  const loadProfile = async () => {
    const userLocal = JSON.parse(localStorage.getItem("user"));
    if (!userLocal) {
      navigate("/login");
      return;
    }
    setUser(userLocal);

    const { data } = await supabase.from("users").select("*").eq("id", userLocal.id).single();
    if (data) {
      setProfile({ full_name: data.full_name, email: data.email, phone: data.phone, address: data.address, avatar_url: data.avatar_url });
      if (data.role !== 'admin') {
        alert("Access denied. You are not an admin.");
        navigate("/customer");
      }
    }
  };

  // Save profile (uploads avatar if changed).
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;

    let avatarUrl = profile.avatar_url;
    if (avatarFile) {
      const filePath = `${user.id}.png`;
      const { error: uploadErr } = await supabase.storage.from("user-avatars").upload(filePath, avatarFile, { upsert: true });
      if (uploadErr) return alert("Avatar upload failed.");
      const { data } = supabase.storage.from("user-avatars").getPublicUrl(filePath);
      avatarUrl = data.publicUrl;
    }

    const { error } = await supabase.from("users").update({ full_name: profile.full_name, email: profile.email, phone: profile.phone, address: profile.address, avatar_url: avatarUrl }).eq("id", user.id);
    if (error) return alert("Profile update failed.");

    localStorage.setItem("user", JSON.stringify({ ...user, email: profile.email, avatar_url: avatarUrl }));
    setProfile({ ...profile, avatar_url: avatarUrl });
    alert("Profile updated!");
    setProfileModal(false);
  };

  // ------------------
  // Data loading helpers
  // ------------------
  // Load products and include their variants in one query
  const loadProducts = async () => {
    const { data } = await supabase.from("products").select(`*, variants:product_variants (*)`).order("created_at", { ascending: false });
    if (data) setProducts(data);
  };

  // Load orders and normalize item images (resolve public URLs when needed)
  const loadOrders = async () => {
    // include payments relationship so admin can see transaction id and payment status/method
    const { data } = await supabase.from("orders").select(`*, users (full_name, email), payments (*), order_items ( id, name, quantity, price, color, size, products (*), product_variants (*) )`).order("created_at", { ascending: false });
    if (data) {
      const normalized = await Promise.all(data.map(async (o) => {
        const resolvedItems = await Promise.all((o.order_items || []).map(async (it) => {
          let img = it.img_url || it.product_variants?.img_url || it.products?.img_url || "";
          if (img && !img.startsWith("http") && supabase && typeof supabase.storage !== 'undefined') {
            try {
              const { data: publicData } = supabase.storage.from("products").getPublicUrl(img);
              img = publicData?.publicUrl || img;
            } catch (e) {
              console.debug("getPublicUrl failed", e);
            }
          }
          return { ...it, img_url: img };
        }));
        // normalize payments: pick first payment row if present
        const payment = (o.payments && o.payments.length > 0) ? o.payments[0] : null;
        return { ...o, order_items: resolvedItems, payment };
      }));
      setOrders(normalized);
    }
  };

  useEffect(() => {
    loadProducts();
    loadOrders();
    loadProfile();
  }, []);

  // Logout helper
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("user");
    navigate("/login");
  };

  // Update order status and optionally restock items when cancelling early orders
  async function updateStatus(orderId, newStatus) {
    try {
      const { data: currentOrder, error: fetchErr } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (fetchErr || !currentOrder) throw fetchErr || new Error("Order not found");

      const prevStatus = (currentOrder.status || "").toLowerCase();
      const targetStatus = (newStatus || "").toLowerCase();

      // Persist the new status
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
      if (error) throw error;

      // If cancelling while order was still pending/processing, restore variant/product stock
      if (targetStatus === "cancelled" && (prevStatus === "pending" || prevStatus === "processing")) {
        const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId);
        const productIdsToRecalc = new Set();
        for (const it of items || []) {
          const { data: variant } = await supabase.from("product_variants").select("*").eq("id", it.product_variant_id).single();
          if (!variant) continue;
          const newStock = Number(variant.stock || 0) + Number(it.quantity || 0);
          await supabase.from("product_variants").update({ stock: newStock }).eq("id", variant.id);
          productIdsToRecalc.add(variant.product_id);
        }
        for (const pid of productIdsToRecalc) {
          const { data: vars } = await supabase.from("product_variants").select("stock").eq("product_id", pid);
          const total = (vars || []).reduce((s, v) => s + Number(v.stock || 0), 0);
          await supabase.from("products").update({ stock: total }).eq("id", pid);
        }
      }

      alert("Status updated");
      await loadOrders();
      await loadProducts();
      return;
    } catch (err) {
      console.error(err);
      alert("Failed to update status");
    }
  }

  // Delete an order; if the order is early (pending/processing) restore stock similar to updateStatus
  async function deleteOrder(orderId) {
    try {
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
      const st = (order?.status || "").toLowerCase();
      if (order && (st === "pending" || st === "processing")) {
        const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId);
        const productIdsToRecalc = new Set();
        for (const it of items || []) {
          const { data: variant } = await supabase.from("product_variants").select("*").eq("id", it.product_variant_id).single();
          if (!variant) continue;
          const newStock = Number(variant.stock || 0) + Number(it.quantity || 0);
          await supabase.from("product_variants").update({ stock: newStock }).eq("id", variant.id);
          productIdsToRecalc.add(variant.product_id);
        }
        for (const pid of productIdsToRecalc) {
          const { data: vars } = await supabase.from("product_variants").select("stock").eq("product_id", pid);
          const total = (vars || []).reduce((s, v) => s + Number(v.stock || 0), 0);
          await supabase.from("products").update({ stock: total }).eq("id", pid);
        }
      }

      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
      alert("Order deleted");
      await loadOrders();
      await loadProducts();
    } catch (err) {
      console.error(err);
      alert("Failed to delete order");
    }
  }

  // ------------------
  // Variant helpers: add/remove variants in UI state (no DB calls here)
  // ------------------
  const handleAddVariant = (setter) => {
    if (!newVariant.stock || Number(newVariant.stock) <= 0) return alert("Stock must be a number greater than 0.");
    if (!newVariant.color || !newVariant.size) return alert("Please select both color and size.");

    setter((prevProduct) => {
      const isDuplicate = prevProduct.variants.some((v) => v.color === newVariant.color && v.size === newVariant.size);
      if (isDuplicate) {
        alert("Variant (Color/Size combination) already added.");
        return prevProduct;
      }

      const variantToAdd = { id: null, ...newVariant, stock: Number(newVariant.stock) };
      const newVariants = [...prevProduct.variants, variantToAdd];

      // Reset the temporary newVariant inputs
      setNewVariant({ color: AVAILABLE_COLORS[0], size: AVAILABLE_SIZES[1], stock: "", imgFile: null, img_url: "" });

      return { ...prevProduct, variants: newVariants };
    });
  };

  const handleRemoveVariant = (index, setter) => {
    setter((prevProduct) => ({ ...prevProduct, variants: prevProduct.variants.filter((_, i) => i !== index) }));
  };

  // ------------------
  // Add product (uploads variant images, creates product and variants rows)
  // ------------------
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (newProduct.variants.length === 0) return alert("Please add at least one product variant (Color/Size/Stock).");

    const { variants, ...productData } = newProduct;
    const uploadedVariants = [];

    for (const variant of variants) {
      let variantImgUrl = variant.img_url;
      if (variant.imgFile) {
        const filePath = `products/${Date.now()}-${variant.imgFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("products").upload(filePath, variant.imgFile, { upsert: true });
        if (uploadErr) return alert(`Image upload failed for ${variant.color} ${variant.size}: ${uploadErr.message || JSON.stringify(uploadErr)}`);
        const { data } = supabase.storage.from("products").getPublicUrl(filePath);
        variantImgUrl = data.publicUrl;
      }
      uploadedVariants.push({ color: variant.color, size: variant.size, stock: variant.stock, img_url: variantImgUrl });
    }

    const totalStock = uploadedVariants.reduce((sum, v) => sum + Number(v.stock), 0);
    const mainImgUrl = uploadedVariants[0]?.img_url || "";

    const { data: productInsertData, error: productError } = await supabase.from("products").insert([{ ...productData, img_url: mainImgUrl, stock: totalStock }]).select().single();
    if (productError || !productInsertData) return alert(`Failed to add main product: ${productError?.message || JSON.stringify(productError) || "Unknown"}`);

    const newProductId = productInsertData.id;
    const variantsPayload = uploadedVariants.map((v) => ({ ...v, product_id: newProductId }));
    const { error: variantsError } = await supabase.from("product_variants").insert(variantsPayload);
    if (variantsError) return alert(`Product added, but failed to add variants: ${variantsError.message || JSON.stringify(variantsError)}`);

    alert("Product and variants added successfully!");
    setNewProduct({ name: "", description: "", price: "", category: "latest", variants: [] });
    setNewVariant({ color: AVAILABLE_COLORS[0], size: AVAILABLE_SIZES[1], stock: "", imgFile: null, img_url: "" });
    loadProducts();
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm("Are you sure? This will also delete all variants.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (!error) loadProducts();
  };

  // ------------------
  // Edit product: process variant uploads, update existing variants, delete removed ones
  // ------------------
  const handleEditSave = async (e) => {
    e.preventDefault();
    if (editingProduct.variants.length === 0) return alert("Please ensure the product has at least one variant.");

    const { variants, id: productId, ...productData } = editingProduct;
    const variantsToInsert = [];
    const existingVariantIds = [];

    for (const variant of variants) {
      let finalUrl = variant.img_url;
      if (variant.imgFile) {
        const filePath = `products/${Date.now()}-${variant.imgFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("products").upload(filePath, variant.imgFile, { upsert: true });
        if (uploadErr) return alert(`Image upload failed for variant ${variant.color} ${variant.size}`);
        const { data } = supabase.storage.from("products").getPublicUrl(filePath);
        finalUrl = data.publicUrl;
        variant.img_url = finalUrl;
      }

      const variantPayload = { product_id: productId, color: variant.color, size: variant.size, stock: Number(variant.stock), img_url: finalUrl };
      if (variant.id) {
        const { error: updateError } = await supabase.from("product_variants").update(variantPayload).eq("id", variant.id);
        if (updateError) return alert(`Failed to update variant ${variant.color} ${variant.size}.`);
        existingVariantIds.push(variant.id);
      } else {
        variantsToInsert.push(variantPayload);
      }
    }

    const mainImgUrl = variants[0]?.img_url || variantsToInsert[0]?.img_url || "";
    const { error: productUpdateError } = await supabase.from("products").update({ ...productData, img_url: mainImgUrl }).eq("id", productId);
    if (productUpdateError) return alert("Failed to update main product details.");

    // delete removed variants
    const { data: currentVariantIds } = await supabase.from("product_variants").select('id').eq('product_id', productId);
    const idsToDelete = currentVariantIds.map(v => v.id).filter(id => !existingVariantIds.includes(id));
    if (idsToDelete.length > 0) await supabase.from("product_variants").delete().in("id", idsToDelete);

    if (variantsToInsert.length > 0) {
      const { error: insertNewError } = await supabase.from("product_variants").insert(variantsToInsert);
      if (insertNewError) return alert("Product updated, but failed to add new variants.");
    }

    try {
      const { data: remainingVariants } = await supabase.from("product_variants").select("stock").eq("product_id", productId);
      const totalStock = (remainingVariants || []).reduce((s, v) => s + Number(v.stock || 0), 0);
      await supabase.from("products").update({ stock: totalStock }).eq("id", productId);
    } catch (err) {
      console.warn("Failed to recompute product stock after edit", err);
    }

    alert("Product updated successfully!");
    setEditingProduct(null);
    setNewVariant({ color: AVAILABLE_COLORS[0], size: AVAILABLE_SIZES[1], stock: "", imgFile: null, img_url: "" });
    loadProducts();
  };

  // Prepare a product for editing in the modal - add imgFile field for UI previews
  const handleEditClick = (product) => {
    const variantsWithFiles = product.variants.map(v => ({ ...v, imgFile: null }));
    setEditingProduct({ ...product, variants: variantsWithFiles });
  };

  // ------------------
  // UI rendering starts here
  // ------------------
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 bg-gray-100 bg-gradient-to-r from-slate-900 to-slate-500 min-h-screen">

      {/* TOP BAR & TABS */}
      <nav className="navbar-admin-header sticky top-0 z-40 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-4 min-w-0">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md flex-shrink-0">
              <img src={logo} alt="CAPS UA" className="h-8 w-8 object-contain" />
            </div>

            <div className="hidden sm:flex flex-col truncate">
              <span className="text-lg font-bold text-white truncate">Admin Panel</span>
              <span className="text-xs text-slate-300 truncate">UA Caps Management</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/customer")}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-md border border-slate-600"
            >
              View Site
            </button>

            <button
              onClick={() => setProfileModal(true)}
              title="Edit profile"
              className="w-10 h-10 p-0.5 rounded-full border-2 border-slate-600 hover:border-emerald-400 bg-slate-700 overflow-hidden"
            >
              <img
                src={profile.avatar_url || "https://via.placeholder.com/40"}
                alt="Admin Avatar"
                className="w-full h-full object-cover rounded-full"
              />
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-md shadow-sm"
            >
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* TABS */}
      <div className="flex gap-2 pb-2 border-b">
        <button
          onClick={() => setTab("products")}
          className={`px-4 py-2 rounded ${tab === "products" ? "bg-black text-white" : "bg-gray-200"
            }`}
        >
          Products
        </button>

        <button
          onClick={() => setTab("orders")}
          className={`px-4 py-2 rounded ${tab === "orders" ? "bg-black text-white" : "bg-gray-200"
            }`}
        >
          Orders
        </button>
      </div>

      {/* PRODUCTS TAB */}
      {tab === "products" && (
        <>
          {/* ADD PRODUCT FORM (UNCHANGED) */}
          <div className="bg-white p-4 border rounded space-y-4">
            <h2 className="text-lg font-bold">Add Product</h2>

            <form
              onSubmit={handleAddProduct}
              className="grid grid-cols-1 gap-3"
            >
              {/* Product Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Product Name"
                  value={newProduct.name}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, name: e.target.value })
                  }
                  className="border p-2 rounded"
                />

                <input
                  required
                  placeholder="Price"
                  type="number"
                  min="0"
                  value={newProduct.price}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, price: e.target.value })
                  }
                  className="border p-2 rounded"
                />

                <select
                  value={newProduct.category}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, category: e.target.value })
                  }
                  className="border p-2 rounded"
                >
                  <option value="latest">Latest</option>
                  <option value="fashion">Fashion</option>
                  <option value="casual">Casual</option>
                  <option value="sports">Sports</option>
                </select>

                <textarea
                  placeholder="Description"
                  value={newProduct.description}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      description: e.target.value,
                    })
                  }
                  className="border p-2 rounded"
                />
              </div>

              {/* Variant Section */}
              <div className="border p-4 rounded bg-gray-50 space-y-3">
                <h3 className="font-semibold text-md">Product Variants (Color/Size/Stock)</h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <select
                    value={newVariant.color}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, color: e.target.value })
                    }
                    className="border p-2 rounded"
                  >
                    {AVAILABLE_COLORS.map(c => <option key={c}>{c}</option>)}
                  </select>

                  <select
                    value={newVariant.size}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, size: e.target.value })
                    }
                    className="border p-2 rounded"
                  >
                    {AVAILABLE_SIZES.map(s => <option key={s}>{s}</option>)}
                  </select>

                  <input
                    required
                    placeholder="Stock"
                    type="number"
                    min="1"
                    value={newVariant.stock}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, stock: e.target.value })
                    }
                    className="border p-2 rounded"
                  />

                  <input
                    type="file"
                    required={newProduct.variants.length === 0} // Require image on first variant
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, imgFile: e.target.files[0] })
                    }
                    className="border p-2 rounded text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleAddVariant(setNewProduct)}
                  className="bg-blue-600 text-white rounded py-1 px-3 text-sm hover:bg-blue-700"
                >
                  Add Variant
                </button>

                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {newProduct.variants.map((v, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-white border rounded text-sm">
                      <div className="flex items-center gap-2">
                        <img
                          src={
                            v.imgFile
                              ? URL.createObjectURL(v.imgFile)
                              : v.img_url || "https://via.placeholder.com/30"
                          }
                          className="w-8 h-8 object-cover rounded"
                          alt="Variant thumbnail"
                        />
                        <div>
                          <span className="font-medium">{v.color} / {v.size}</span>
                          <span className="ml-2 text-gray-500">Stock: {v.stock}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(index, setNewProduct)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {newProduct.variants.length === 0 && (
                    <p className="text-gray-500 text-center text-sm">No variants added yet.</p>
                  )}
                </div>
              </div>

              {/* Live computed total stock so admins don't need to set a product-level stock */}
              <div className="flex items-center justify-between mt-3">
                <div className="text-sm text-gray-600">Total stock (calculated from variants):</div>
                <div className="font-bold">{(newProduct.variants || []).reduce((sum, v) => sum + Number(v.stock || 0), 0)}</div>
              </div>

              <button
                type="submit"
                aria-label="Add product"
                className="col-span-full mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-500 text-white font-semibold rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Product</span>
              </button>
            </form>
          </div>

          {/* PRODUCT GRID (UPDATED to use handleEditClick) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <div key={p.id} className="bg-white border rounded shadow p-3">
                <img
                  src={p.img_url || "https://via.placeholder.com/150"}
                  alt={p.name}
                  className="h-36 w-full object-cover rounded mb-2"
                />

                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-gray-500">{p.category}</div>
                <div className="text-sm truncate">{p.description}</div>

                <div className="font-bold text-green-700 mt-1">
                  ${p.price}
                </div>
                <div className="text-xs text-gray-700 mt-1">
                  Variants: {p.variants?.length || 0}
                </div>
                <div className="text-xs text-gray-700">
                  Total Stock: {p.variants?.reduce((sum, v) => sum + Number(v.stock), 0) || 0}
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setViewProduct(p)}
                    className="flex-1 bg-slate-200 text-slate-800 py-1 rounded text-sm hover:bg-slate-300"
                  >
                    View
                  </button>

                  <button
                    onClick={() => handleEditClick(p)} // Changed to use helper function
                    className="flex-1 bg-black text-white py-1 rounded text-sm hover:bg-gray-800"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDeleteProduct(p.id)}
                    className="flex-1 bg-red-600 text-white py-1 rounded text-sm hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ADMIN PRODUCT VIEW MODAL */}
      {viewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <AdminProductViewModal product={viewProduct} onClose={() => setViewProduct(null)} />
        </div>
      )}


      {/* EDIT PRODUCT MODAL (REVISED & FIXED) */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-10">
          <form
            onSubmit={handleEditSave}
            className="bg-white p-5 rounded shadow max-w-lg w-full space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-lg font-bold">Edit Product: {editingProduct.name}</h2>

            {/* Product Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Name"
                value={editingProduct.name}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, name: e.target.value })
                }
                className="border p-2 rounded w-full"
              />

              <input
                type="number"
                min="0"
                placeholder="Price"
                value={editingProduct.price}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, price: e.target.value })
                }
                className="border p-2 rounded w-full"
              />

              <select
                value={editingProduct.category}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, category: e.target.value })
                }
                className="border p-2 rounded w-full"
              >
                <option value="latest">Latest</option>
                <option value="fashion">Fashion</option>
                <option value="casual">Casual</option>
                <option value="sports">Sports</option>
              </select>

              <textarea
                placeholder="Description"
                value={editingProduct.description}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    description: e.target.value,
                  })
                }
                className="border p-2 rounded w-full"
              />
            </div>

            {/* Variant Section */}
            <div className="border p-4 rounded bg-gray-50 space-y-3">
              <h3 className="font-semibold text-md">Manage Variants</h3>

              {/* New Variant Input */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={newVariant.color}
                  onChange={(e) =>
                    setNewVariant({ ...newVariant, color: e.target.value })
                  }
                  className="border p-2 rounded"
                >
                  {AVAILABLE_COLORS.map(c => <option key={c}>{c}</option>)}
                </select>

                <select
                  value={newVariant.size}
                  onChange={(e) =>
                    setNewVariant({ ...newVariant, size: e.target.value })
                  }
                  className="border p-2 rounded"
                >
                  {AVAILABLE_SIZES.map(s => <option key={s}>{s}</option>)}
                </select>

                <input
                  placeholder="Stock (New)"
                  type="number"
                  min="1"
                  value={newVariant.stock}
                  onChange={(e) =>
                    setNewVariant({ ...newVariant, stock: e.target.value })
                  }
                  className="border p-2 rounded"
                />

                <input
                  type="file"
                  onChange={(e) =>
                    setNewVariant({ ...newVariant, imgFile: e.target.files[0] })
                  }
                  className="border p-2 rounded text-xs"
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddVariant(setEditingProduct)}
                className="bg-blue-600 text-white rounded py-1 px-3 text-sm hover:bg-blue-700"
              >
                Add New Variant
              </button>

              {/* Existing/New Variants List */}
              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                {editingProduct.variants.map((v, index) => (
                  // FIX: Use index as key if v.id is null (for newly added variants)
                  <div key={v.id || index} className="p-2 bg-white border rounded text-sm">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <img
                          src={
                            v.imgFile
                              ? URL.createObjectURL(v.imgFile)
                              : v.img_url || "https://via.placeholder.com/30"
                          }
                          className="w-8 h-8 object-cover rounded"
                          alt={`${v.color} ${v.size}`}
                        />
                        <div className="font-medium">{v.color} / {v.size}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(index, setEditingProduct)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {/* Stock input for existing variant */}
                      <input
                        type="number"
                        min="0"
                        placeholder="Stock"
                        value={v.stock}
                        onChange={(e) => {
                          const newStock = e.target.value;
                          setEditingProduct(prev => ({
                            ...prev,
                            variants: prev.variants.map((variant, i) =>
                              i === index ? { ...variant, stock: newStock } : variant
                            )
                          }))
                        }}
                        className="border p-2 rounded w-full text-xs"
                      />
                      {/* File input for existing variant (to change image) */}
                      <input
                        type="file"
                        onChange={(e) => {
                          const newFile = e.target.files[0];
                          setEditingProduct(prev => ({
                            ...prev,
                            variants: prev.variants.map((variant, i) =>
                              i === index ? { ...variant, imgFile: newFile } : variant
                            )
                          }))
                        }}
                        className="border p-2 rounded w-full text-xs"
                      />
                    </div>
                  </div>
                ))}
                {editingProduct.variants.length === 0 && (
                  <p className="text-gray-500 text-center text-sm">No variants added yet. Add one above.</p>
                )}
              </div>
            </div>


            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setNewVariant({
                    color: AVAILABLE_COLORS[0],
                    size: "All Fit",
                    stock: "",
                    imgFile: null,
                    img_url: "",
                  });
                }}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>

              <button className="px-3 py-1 btn-primary rounded">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ORDERS TAB (REVISED Order Items Display) */}
      {tab === "orders" && (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="bg-white border rounded p-4 shadow">
                  <div className="flex items-center justify-between">
                    <div className="font-bold">Order #{order.id.slice(0, 8)}</div>
                    <button onClick={() => setViewOrder(order)} className="text-sm px-2 py-1 border rounded">View Details</button>
                  </div>
              <div className="text-sm text-gray-600">
                {order.users?.full_name} ({order.users?.email}) {order.created_at && `- ${new Date(order.created_at).toLocaleString()}`}

                {/* Shipping / phone information (snapshot saved on order) */}
                <div className="mt-1 text-xs text-gray-700">
                  <div>Phone: {order.shipping_phone || "—"}</div>
                  <div>
                    Address: {order.shipping_address_line ? (
                      <span>
                        {order.shipping_address_line}{order.shipping_city ? `, ${order.shipping_city}` : ""}{order.shipping_province ? `, ${order.shipping_province}` : ""}{order.shipping_postal_code ? ` • ${order.shipping_postal_code}` : ""}
                        {order.shipping_label ? ` (${order.shipping_label})` : order.shipping_full_name ? " (profile)" : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">No address recorded</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2 font-bold">Total: ${order.total}</div>

              <div className="mt-1 text-sm">
                <strong>Payment:</strong>
                <div className="text-xs text-gray-700">
                  <div>Method: {order.payment?.method || order.payment_method || "—"}</div>
                  <div>Status: {order.payment?.status || order.payment_status || "—"}</div>
                  {order.payment?.transaction_id && <div>Txn: {order.payment.transaction_id}</div>}
                </div>
              </div>

              <div className="flex flex-col gap-3 p-4 border rounded-lg">
                {/* Current Status */}
                <div className="font-semibold">
                  Status: <span className="text-blue-600">{order.status}</span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const st = (order.status || "").toLowerCase();
                    const isLocked = st === "delivered" || st === "cancelled";
                    return (
                      <>
                        {/* PROCESS */}
                        <button
                          onClick={() => updateStatus(order.id, "Processing")}
                          disabled={isLocked}
                          className={`px-3 py-1 rounded ${isLocked ? "bg-gray-400 text-gray-700 cursor-not-allowed" : "bg-yellow-500 text-white"}`}
                        >
                          Process
                        </button>

                        {/* SHIPPING */}
                        <button
                          onClick={() => updateStatus(order.id, "Shipping")}
                          disabled={isLocked}
                          className={`px-3 py-1 rounded ${isLocked ? "bg-gray-400 text-gray-700 cursor-not-allowed" : "bg-blue-500 text-white"}`}
                        >
                          Shipping
                        </button>

                        {/* DELIVERED */}
                        <button
                          onClick={() => updateStatus(order.id, "Delivered")}
                          disabled={isLocked}
                          className={`px-3 py-1 rounded ${isLocked ? "bg-gray-400 text-gray-700 cursor-not-allowed" : "bg-green-600 text-white"}`}
                        >
                          Delivered
                        </button>

                        {/* CANCEL */}
                        <button
                          onClick={() => updateStatus(order.id, "Cancelled")}
                          disabled={isLocked}
                          className={`px-3 py-1 rounded ${isLocked ? "bg-gray-400 text-gray-700 cursor-not-allowed" : "bg-red-500 text-white"}`}
                        >
                          Cancel
                        </button>

                        {/* DELETE */}
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="px-3 py-1 bg-gray-700 text-white rounded"
                        >
                          Delete
                        </button>
                      </>
                    );
                  })()}

                </div>
              </div>


              <div className="mt-3 text-sm">
                <strong>Items:</strong>
                {order.order_items?.map((item) => (
                  // Show snapshot data + joined product/variant images when available
                  <div key={item.id} className="ml-2 flex items-center gap-3 py-2 border-b last:border-b-0">
                    <div className="w-12 h-12 rounded overflow-hidden bg-gray-100">
                      <img
                        src={
                          item.img_url || item.product_variants?.img_url || item.products?.img_url || "https://via.placeholder.com/80"
                        }
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-600">{item.color || "—"} • {item.size || "—"}</div>
                    </div>

                    <div className="text-sm text-gray-700 text-right">
                      <div className="font-semibold">${Number(item.price || 0).toFixed(2)}</div>
                      <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Render admin order details modal when requested */}
              {viewOrder && viewOrder.id === order.id && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                  <div className="bg-white w-full max-w-3xl p-4 rounded shadow-lg max-h-[90vh] overflow-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold">Order Details — #{viewOrder.id?.slice(0,8)}</h3>
                      <button onClick={() => setViewOrder(null)} className="text-gray-600">Close</button>
                    </div>

                    <div className="mb-3 text-sm text-gray-700">
                      <div><strong>Placed:</strong> {new Date(viewOrder.created_at).toLocaleString()}</div>
                      <div><strong>Status:</strong> {viewOrder.status}</div>
                      <div><strong>Customer:</strong> {viewOrder.users?.full_name} ({viewOrder.users?.email})</div>
                      <div><strong>Payment:</strong> {viewOrder.payment?.method || viewOrder.payment_method || "—"} • {viewOrder.payment?.status || viewOrder.payment_status || "—"}{viewOrder.payment?.transaction_id ? ` • Txn: ${viewOrder.payment.transaction_id}` : ""}</div>
                    </div>

                    <div className="mb-3">
                      <h4 className="font-semibold">Shipping</h4>
                      <div className="text-sm text-gray-700 mt-1">
                        <div>{viewOrder.shipping_full_name}</div>
                        <div>{viewOrder.shipping_phone}</div>
                        <div>{viewOrder.shipping_address_line}</div>
                        <div>{viewOrder.shipping_city} {viewOrder.shipping_province} {viewOrder.shipping_postal_code}</div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold">Items</h4>
                      <div className="mt-2 space-y-2">
                        {(viewOrder.order_items || []).map((it) => (
                          <div key={it.id} className="flex items-center gap-3 border rounded p-2">
                            <div className="w-16 h-16 rounded overflow-hidden bg-gray-100">
                              <img src={it.img_url || it.product_variants?.img_url || it.products?.img_url || "https://via.placeholder.com/80"} alt={it.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{it.name}</div>
                              <div className="text-xs text-gray-600">{it.color || '—'} / {it.size || '—'}</div>
                              <div className="text-xs text-gray-500">Product: {it.products?.name || '—'}</div>
                            </div>
                            <div className="text-sm font-semibold">x{it.quantity} • ${Number(it.price || 0).toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-600">Order ID: {viewOrder.id}</div>
                      <div className="font-bold">Total: ${Number(viewOrder.total || 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PROFILE MODAL - (UNCHANGED) */}
      {profileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center p-4">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white p-5 rounded space-y-3 max-w-sm w-full"
          >
            <h2 className="text-lg font-bold">Edit Profile</h2>

            <div className="flex flex-col items-center">
              <img
                src={
                  avatarFile
                    ? URL.createObjectURL(avatarFile)
                    : profile.avatar_url || "https://via.placeholder.com/80"
                }
                className="w-20 h-20 rounded-full border object-cover"
                alt="Profile Avatar"
              />

              <input
                type="file"
                className="mt-2"
                onChange={(e) => setAvatarFile(e.target.files[0])}
              />
            </div>

            <input
              type="text"
              placeholder="Full Name"
              required
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              className="border p-2 rounded w-full"
            />

            <input
              type="email"
              placeholder="Email"
              required
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="border p-2 rounded w-full"
            />

            <input
              type="tel"
              placeholder="Phone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="border p-2 rounded w-full"
            />

            <textarea
              placeholder="Address"
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="border p-2 rounded w-full"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProfileModal(false)}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-black text-white rounded hover:bg-gray-800"
              >
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* -------------------------
  AdminProductViewModal
  - Similar to customer ProductViewModal but read-only for admin
--------------------------*/
function AdminProductViewModal({ product, onClose }) {
  const [mainImg, setMainImg] = useState(product.img_url || (product.variants && product.variants[0] && product.variants[0].img_url) || "");
  const [soldCount, setSoldCount] = useState(0);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (!product) return;
    setMainImg(product.img_url || (product.variants && product.variants[0] && product.variants[0].img_url) || "");

    let mounted = true;
    async function loadMeta() {
      try {
        const { data: items } = await supabase.from("order_items").select("quantity").eq("product_id", product.id);
        const total = (items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
        if (mounted) setSoldCount(total);
      } catch (e) {
        console.debug("Failed to load sold count", e);
      }

      try {
        const { data: rev } = await supabase
          .from("product_reviews")
          .select(`id, rating, comment, created_at, users (full_name, avatar_url)`)
          .eq("product_id", product.id)
          .order("created_at", { ascending: false });
        if (mounted) setReviews(rev || []);
      } catch (e) {
        console.debug("No product_reviews table or failed to load reviews", e);
      }
    }
    loadMeta();
    return () => { mounted = false; };
  }, [product]);

  return (
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
            <div className="text-lg font-semibold text-emerald-600">${Number(product.price || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="mt-3">
          <h3 className="font-semibold">Description</h3>
          <p className="text-sm text-gray-700 mt-1">{product.description || "No description available."}</p>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <div className="text-sm text-gray-600">Sold:</div>
          <div className="font-semibold">{soldCount}</div>
        </div>

        <div className="mt-4">
          <h4 className="font-semibold">Reviews ({reviews.length})</h4>
          <div className="mt-2 space-y-3 max-h-48 overflow-y-auto">
            {reviews.length === 0 && <div className="text-sm text-gray-500">No reviews yet.</div>}
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

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border rounded">Close</button>
        </div>
      </div>
    </div>
  );
}