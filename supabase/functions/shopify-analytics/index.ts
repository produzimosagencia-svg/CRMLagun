import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SHOPIFY_STORE_DOMAIN = "pixel-love-styles-fy2nu.myshopify.com";
const SHOPIFY_API_VERSION = "2025-01";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  try {
    const accessToken = Deno.env.get("SHOPIFY_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing Shopify access token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;
    const headers = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    };

    // Fetch all orders (paginated)
    let allOrders: any[] = [];
    let pageInfo: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const url = pageInfo
        ? `${adminUrl}/orders.json?limit=250&status=any&page_info=${pageInfo}`
        : `${adminUrl}/orders.json?limit=250&status=any`;

      const ordersRes = await fetch(url, { headers });
      if (!ordersRes.ok) {
        const errorText = await ordersRes.text();
        console.error("Shopify orders error:", ordersRes.status, errorText);
        return new Response(JSON.stringify({ error: `Shopify API error: ${ordersRes.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ordersData = await ordersRes.json();
      allOrders = allOrders.concat(ordersData.orders || []);

      // Check for pagination via Link header
      const linkHeader = ordersRes.headers.get("link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]*)[^>]*>;\s*rel="next"/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
    }

    // Calculate metrics
    let grossRevenue = 0;
    let netRevenue = 0;
    let totalItemsSold = 0;
    let totalOrders = 0;
    const productSales: Record<string, { title: string; quantity: number; image: string | null }> = {};

    for (const order of allOrders) {
      if (order.cancelled_at) continue;
      
      totalOrders++;
      const orderTotal = parseFloat(order.total_price || "0");
      const discounts = parseFloat(order.total_discounts || "0");
      // Approximate net: total - discounts - refunds
      const refundAmount = (order.refunds || []).reduce((sum: number, r: any) => {
        return sum + (r.transactions || []).reduce((ts: number, t: any) => ts + parseFloat(t.amount || "0"), 0);
      }, 0);

      grossRevenue += orderTotal;
      netRevenue += orderTotal - refundAmount;

      for (const item of order.line_items || []) {
        totalItemsSold += item.quantity || 0;
        const productId = String(item.product_id);
        if (!productSales[productId]) {
          productSales[productId] = {
            title: item.title || "Produto",
            quantity: 0,
            image: null,
          };
        }
        productSales[productId].quantity += item.quantity || 0;
      }
    }

    // Get product images for top sellers
    const sortedProducts = Object.entries(productSales)
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 5);

    for (const [productId, product] of sortedProducts) {
      try {
        const prodRes = await fetch(`${adminUrl}/products/${productId}.json?fields=id,image`, { headers });
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          product.image = prodData.product?.image?.src || null;
        }
      } catch {
        // ignore image fetch errors
      }
    }

    const avgTicket = totalOrders > 0 ? grossRevenue / totalOrders : 0;

    const result = {
      grossRevenue,
      netRevenue,
      totalItemsSold,
      totalOrders,
      avgTicket,
      topProducts: sortedProducts.map(([id, p]) => ({
        id,
        title: p.title,
        quantity: p.quantity,
        image: p.image,
      })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shopify-analytics error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
