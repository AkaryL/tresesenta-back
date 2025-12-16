/**
 * Servicio de Shopify Admin API para Tenis360
 */

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const API_VERSION = process.env.SHOPIFY_API_VERSION;
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

const BASE_URL = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}`;

async function shopifyRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (response.status === 429) {
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[SHOPIFY] Error ${response.status}: ${errorText}`);
    throw new Error(`Shopify API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Buscar customer por email
 */
async function findCustomerByEmail(email) {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const encodedEmail = encodeURIComponent(`email:${normalizedEmail}`);

    const data = await shopifyRequest(`/customers/search.json?query=${encodedEmail}`);

    if (data.customers && data.customers.length > 0) {
      const exactMatch = data.customers.find(
        c => c.email && c.email.toLowerCase() === normalizedEmail
      );
      return exactMatch || null;
    }

    return null;
  } catch (error) {
    console.error('[SHOPIFY] Error buscando customer:', error.message);
    throw error;
  }
}

/**
 * Crear nuevo customer en Shopify
 */
async function createCustomer(customerData) {
  try {
    const { email, first_name = '', last_name = '' } = customerData;

    const payload = {
      customer: {
        email: email.toLowerCase().trim(),
        first_name: first_name || 'Cliente',
        last_name: last_name || 'Tenis360',
        verified_email: true,
        send_email_welcome: false
      }
    };

    const data = await shopifyRequest('/customers.json', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    console.log(`[SHOPIFY] Customer creado: ${data.customer.id}`);
    return data.customer;
  } catch (error) {
    console.error('[SHOPIFY] Error creando customer:', error.message);
    throw error;
  }
}

/**
 * Obtener detalles de un producto por ID
 */
async function getProductById(productId) {
  try {
    const data = await shopifyRequest(`/products/${productId}.json`);
    return data.product;
  } catch (error) {
    console.error(`[SHOPIFY] Error obteniendo producto ${productId}:`, error.message);
    return null;
  }
}

/**
 * Obtener órdenes de un customer con imágenes de productos
 */
async function getCustomerOrders(customerId) {
  try {
    const data = await shopifyRequest(
      `/orders.json?status=any&customer_id=${customerId}&limit=50&order=created_at desc`
    );

    const orders = data.orders || [];

    // Recopilar todos los product_ids únicos
    const productIds = new Set();
    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        if (item.product_id) {
          productIds.add(item.product_id);
        }
      });
    });

    // Obtener imágenes de todos los productos (en paralelo, máximo 5 a la vez)
    const productImages = {};
    const productIdsArray = Array.from(productIds);

    for (let i = 0; i < productIdsArray.length; i += 5) {
      const batch = productIdsArray.slice(i, i + 5);
      const products = await Promise.all(
        batch.map(async (id) => {
          const product = await getProductById(id);
          return { id, product };
        })
      );

      products.forEach(({ id, product }) => {
        if (product && product.image) {
          productImages[id] = product.image.src;
        } else if (product && product.images && product.images.length > 0) {
          productImages[id] = product.images[0].src;
        }
      });
    }

    const mappedOrders = orders.map(order => ({
      order_id: order.id,
      order_number: order.order_number,
      name: order.name,
      created_at: order.created_at,
      total_price: order.total_price,
      subtotal_price: order.subtotal_price,
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status || 'unfulfilled',
      items: (order.line_items || []).map(item => ({
        title: item.title,
        variant_title: item.variant_title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
        product_id: item.product_id,
        // Usar imagen del producto obtenida, o la del line_item si existe
        image: productImages[item.product_id] || item.image?.src || null
      })),
      shipping_address: order.shipping_address ? {
        city: order.shipping_address.city,
        province: order.shipping_address.province,
        country: order.shipping_address.country
      } : null
    }));

    return mappedOrders;
  } catch (error) {
    console.error('[SHOPIFY] Error obteniendo órdenes:', error.message);
    throw error;
  }
}

// Re-exportar funciones de email desde el módulo dedicado
const { sendOTPEmail, sendWelcomeEmail } = require('./email');

module.exports = {
  findCustomerByEmail,
  createCustomer,
  getCustomerOrders,
  sendOTPEmail,
  sendWelcomeEmail
};
