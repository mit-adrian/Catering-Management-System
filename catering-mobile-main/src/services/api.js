// src/services/api.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';

// ============================================================
// API CONFIGURATION
// ============================================================

export const getBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Android emulator reaches the host computer through 10.0.2.2.
      // For a real Android phone, set EXPO_PUBLIC_API_URL in mobile/.env.
      return 'http://10.121.221.155:8000/api';
    }

    if (Platform.OS === 'web') {
      return 'http://localhost:8000/api';
    }

    // iOS simulator can use localhost. For a real iPhone, use mobile/.env.
    return 'http://localhost:8000/api';
  }

  return 'https://your-production-domain.com/api';
};

// Get the base URL with proper fallback
export const API_URL = getBaseUrl();

console.log('📱 API URL:', API_URL);
console.log('📱 Platform:', Platform.OS);
console.log('📱 Is Dev:', __DEV__);

// ============================================================
// AXIOS INSTANCE
// ============================================================

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ============================================================
// INTERCEPTORS
// ============================================================

api.interceptors.request.use(
  async (config) => {
    try {
      const isGuest = await AsyncStorage.getItem('@is_guest');
      if (isGuest === 'true') {
        console.log('👤 Guest mode: No token attached');
        return config;
      }

      const token = await AsyncStorage.getItem('@auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      console.log(`📤 ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
      return config;
    } catch (error) {
      console.log('Request interceptor error:', error);
      return config;
    }
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log(`📥 ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    // Network errors
    if (error.code === 'ECONNABORTED' || !error.response) {
      console.error('Network error:', error.message);
      // Normalize to a consistent shape but still reject so callers
      // can use try/catch to detect the failure
      const normalized = new Error(
        'Cannot connect to server. Please check your connection.'
      );
      normalized.networkError = true;
      normalized.originalError = error;
      return Promise.reject(normalized);
    }

    console.error('API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
    });

    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      const isGuest = await AsyncStorage.getItem('@is_guest');
      if (isGuest !== 'true') {
        await AsyncStorage.removeItem('@auth_token');
        await AsyncStorage.removeItem('@user_data');
        await AsyncStorage.removeItem('@user_role');
      }
    }

    return Promise.reject(error);
  }
);

// ============================================================
// API HELPERS
// ============================================================

export const apiHelpers = {
  /**
   * Normalize a successful Axios response into a consistent shape:
   * { success: true, data: ..., message: '...' }
   */
  formatResponse: (response) => {
    if (response && response.data) {
      const body = response.data;

      // Laravel-style { success, data, message }
      if (typeof body === 'object' && body !== null && 'success' in body) {
        return {
          success: body.success !== false,
          data: body.data !== undefined ? body.data : body,
          message: body.message || 'Success',
        };
      }

      // Paginated responses { data: [...], meta: {...} }
      if (body.data !== undefined) {
        return {
          success: true,
          data: body.data,
          meta: body.meta || body,
          message: body.message || 'Success',
        };
      }

      return { success: true, data: body, message: 'Success' };
    }

    return { success: true, data: response, message: 'Success' };
  },

  /**
   * Normalize an error into a consistent shape:
   * { success: false, message: '...', status: 4xx, errors: {...} }
   */
  handleError: (error) => {
    if (error?.response?.data) {
      return {
        success: false,
        message: error.response.data.message || 'An error occurred',
        errors: error.response.data.errors || null,
        status: error.response.status,
      };
    }

    if (error?.networkError) {
      return {
        success: false,
        message: error.message || 'Network error',
        networkError: true,
      };
    }

    return {
      success: false,
      message: error?.message || 'An error occurred',
      networkError: true,
    };
  },
};

// ============================================================
// AUTH API
// ============================================================

export const authAPI = {
  login: (data) => {
    console.log('🔐 Login API called with:', {
      email: data.emailOrUsername || data.email || data.username,
      hasPassword: !!data.password,
    });
    return api.post('/v1/auth/login', {
      userId: data.emailOrUsername || data.email || data.username,
      password: data.password,
      role: data.role || 'customer',
    });
  },

  register: (data) => {
    console.log('📝 Register API called with:', {
      email: data.email,
      firstName: data.first_name,
    });
    return api.post('/v1/register', {
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      password: data.password,
      password_confirmation: data.password_confirmation,
      phone: data.phone || null,
      address: data.address || null,
    });
  },

  logout: () => api.post('/v1/auth/logout'),
  getUser: () => api.get('/v1/auth/user'),
  updateProfile: (data) => api.put('/v1/auth/profile', data),
  changePassword: (data) => api.put('/v1/auth/change-password', data),
  forgotPassword: (data) => api.post('/v1/auth/forgot-password', data),
  resetPassword: (data) => api.post('/v1/auth/reset-password', data),
  updateProfilePhoto: (data) => {
    const formData = new FormData();
    formData.append('profile_photo', data);
    return api.post('/v1/auth/profile-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ============================================================
// CART API
// ============================================================

export const cartAPI = {
  getCart: () => api.get('/v1/cart'),
  addItem: (data) =>
    api.post('/v1/cart/items', {
      menu_item_id: data.menu_item_id || data.id,
      quantity: data.quantity || 1,
    }),
  updateItem: (cartItemId, data) => api.put(`/v1/cart/items/${cartItemId}`, data),
  removeItem: (cartItemId) => api.delete(`/v1/cart/items/${cartItemId}`),
  clearCart: () => api.delete('/v1/cart'),
};

// ============================================================
// BOOKING API
// ============================================================

export const bookingAPI = {
  getBookings: (params = {}) => api.get('/v1/bookings', { params }),
  getBooking: (id) => api.get(`/v1/bookings/${id}`),
  createBooking: (data) => api.post('/v1/bookings', data),
  updateBooking: (id, data) => api.put(`/v1/bookings/${id}`, data),
  deleteBooking: (id) => api.delete(`/v1/bookings/${id}`),
  confirmBooking: (id) => api.post(`/v1/bookings/${id}/confirm`),
  rejectBooking: (id) => api.post(`/v1/bookings/${id}/reject`),
  cancelBooking: (id, data) => api.post(`/v1/bookings/${id}/cancel`, data),
  completeBooking: (id) => api.post(`/v1/bookings/${id}/complete`),
  recordPayment: (id, data) => api.post(`/v1/bookings/${id}/record-payment`, data),
  getPaymentSummary: (id) => api.get(`/v1/bookings/${id}/payment-summary`),
  getCalendarEvents: (params = {}) => api.get('/v1/calendar-events', { params }),
  checkConflicts: (params) => api.get('/v1/bookings/check-conflicts', { params }),
  getStatistics: () => api.get('/v1/bookings-statistics'),
  getEventTypes: () => api.get('/v1/event-types'),
  requestReschedule: (id, data) => api.post(`/v1/bookings/${id}/request-reschedule`, data),
  approveReschedule: (id) => api.post(`/v1/bookings/${id}/approve-reschedule`),
  rejectReschedule: (id) => api.post(`/v1/bookings/${id}/reject-reschedule`),
  cancelWithReason: (id, data) => api.post(`/v1/bookings/${id}/cancel-with-reason`, data),
  getBookingSummary: (id) => api.get(`/v1/bookings/${id}/payment-summary`),

  // ⭐ Availability validation + reschedule workflow
  validateSlot: (data) => api.post('/v1/bookings/validate-slot', data),
  adminReschedule: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/admin-reschedule`, data),
  customerRequestReschedule: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/customer-request-reschedule`, data),
  customerCancelBooking: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/customer-cancel`, data),

  // ⭐ Respond to admin reschedule proposal (accept / counter / cancel)
  customerRespondToReschedule: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/customer-respond-reschedule`, data),
  // Alias
  customerRescheduleResponse: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/customer-respond-reschedule`, data),

  // ⭐ Post-rejection decision (continue / cancel)
  customerPostRejectionDecision: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/customer-post-rejection`, data),

  // ⭐ Customer edit booking (pending_approval only)
  customerUpdate: (bookingId, data) =>
    api.post(`/v1/bookings/${bookingId}/customer-update`, data),
};

// ============================================================
// MENU API
// ============================================================

export const menuAPI = {
  getPublicMenuItems: (params = {}) => api.get('/v1/public/menu-items', { params }),
  getMenuItems: (params = {}) => api.get('/v1/menu-items', { params }),
  getMenuItem: (id) => api.get(`/v1/menu-items/${id}`),
  createMenuItem: (data) => api.post('/v1/menu-items', data),
  updateMenuItem: ({ id, data }) => api.put(`/v1/menu-items/${id}`, data),
  deleteMenuItem: (id) => api.delete(`/v1/menu-items/${id}`),
  toggleAvailability: (id) => api.post(`/v1/menu-items/${id}/toggle-availability`),
  toggleFeatured: (id) => api.post(`/v1/menu-items/${id}/toggle-featured`),
};

// ============================================================
// CATEGORY API
// ============================================================

export const categoryAPI = {
  getPublicCategories: (params = {}) => api.get('/v1/public/meal-categories', { params }),
  getCategories: (params = {}) => api.get('/v1/meal-categories', { params }),
  getCategory: (id) => api.get(`/v1/meal-categories/${id}`),
  createCategory: (data) => api.post('/v1/meal-categories', data),
  updateCategory: ({ id, data }) => api.put(`/v1/meal-categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/v1/meal-categories/${id}`),
};

// ============================================================
// PACKAGE API
// ============================================================

export const packageAPI = {
  getPublicPackages: (params = {}) => api.get('/v1/public/packages', { params }),
  getPackages: (params = {}) => api.get('/v1/packages', { params }),
  getPackage: (id) => api.get(`/v1/packages/${id}`),
  createPackage: (data) => api.post('/v1/packages', data),
  updatePackage: ({ id, data }) => api.put(`/v1/packages/${id}`, data),
  deletePackage: (id) => api.delete(`/v1/packages/${id}`),
};

// ============================================================
// ORDER API
// ============================================================

export const orderAPI = {
  getOrders: (params = {}) => api.get('/v1/orders', { params }),
  getOrder: (id) => api.get(`/v1/orders/${id}`),
  updateStatus: (id, data) => api.post(`/v1/orders/${id}/status`, data),
  addToKitchen: (id) => api.post(`/v1/orders/${id}/add-to-kitchen`),
  removeFromKitchen: (id) => api.post(`/v1/orders/${id}/remove-from-kitchen`),
  addToDelivery: (id) => api.post(`/v1/orders/${id}/add-to-delivery`),
  removeFromDelivery: (id) => api.post(`/v1/orders/${id}/remove-from-delivery`),
  getKitchenOrders: () => api.get('/v1/orders/kitchen-orders'),
  getDeliveryOrders: () => api.get('/v1/orders/delivery-orders'),
  getStatistics: () => api.get('/v1/orders/stats'),
  getIngredients: (id) => api.get(`/v1/orders/${id}/ingredients`),
  computeIngredients: (id) => api.post(`/v1/orders/${id}/compute-ingredients`),
  createFromBooking: (bookingId) => api.post(`/v1/bookings/${bookingId}/create-order`),
};

// ============================================================
// PAYMENT API
// ============================================================

export const paymentAPI = {
  getPayments: (params = {}) => api.get('/v1/payments', { params }),
  getPayment: (id) => api.get(`/v1/payments/${id}`),
  createPayment: (data) => api.post('/v1/payments', data),
  updatePayment: (id, data) => api.put(`/v1/payments/${id}`, data),
  verifyPayment: (id, data) => api.post(`/v1/payments/${id}/verify`, data),
  rejectPayment: (id, data) => api.post(`/v1/payments/${id}/reject`, data),
  deletePayment: (id) => api.delete(`/v1/payments/${id}`),
  refundPayment: (id, data) => api.post(`/v1/payments/${id}/refund`, data),
  getPaymentSummary: (params = {}) => api.get('/v1/payments/summary', { params }),
  downloadReceipt: (id) =>
    api.get(`/v1/payments/${id}/download-receipt`, { responseType: 'blob' }),
};

// ============================================================
// INVOICE API
// ============================================================

export const invoiceAPI = {
  getInvoices: (params = {}) => api.get('/v1/invoices', { params }),
  getInvoice: (id) => api.get(`/v1/invoices/${id}`),
  getDebts: (params = {}) => api.get('/v1/debts', { params }),
  getInvoicePayments: (id) => api.get(`/v1/invoices/${id}/payments`),
  sendReminder: (id, data) => api.post(`/v1/invoices/${id}/reminder`, data),
  downloadInvoice: (id) =>
    api.get(`/v1/invoices/${id}/download`, { responseType: 'blob' }),
};

// ============================================================
// NOTIFICATION API
// ============================================================

export const notificationAPI = {
  getNotifications: (params = {}) => api.get('/v1/notifications', { params }),
  getUnreadCount: () => api.get('/v1/notifications/unread-count'),
  markAsRead: (id) => api.post(`/v1/notifications/${id}/read`),
  markAllAsRead: () => api.post('/v1/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/v1/notifications/${id}`),
  toggleStar: (id) => api.post(`/v1/notifications/${id}/star`),
  clearAll: () => api.delete('/v1/notifications/clear-all'),
};

// ============================================================
// REVIEW API
// ============================================================

export const reviewAPI = {
  getReviews: (params = {}) => api.get('/v1/reviews', { params }),
  getReview: (id) => api.get(`/v1/reviews/${id}`),
  createReview: (data) => api.post('/v1/reviews', data),
  updateReview: (id, data) => api.put(`/v1/reviews/${id}`, data),
  deleteReview: (id) => api.delete(`/v1/reviews/${id}`),
};

// ============================================================
// CUSTOMER API
// ============================================================

export const customerAPI = {
  getCustomers: (params = {}) => api.get('/v1/customers', { params }),
  getCustomer: (id) => api.get(`/v1/customers/${id}`),
  createCustomer: (data) => api.post('/v1/customers', data),
  updateCustomer: (id, data) => api.put(`/v1/customers/${id}`, data),
  deleteCustomer: (id) => api.delete(`/v1/customers/${id}`),
  toggleStatus: (id) => api.post(`/v1/customers/${id}/toggle-status`),
  getBookings: (id) => api.get(`/v1/customers/${id}/bookings`),
  getPayments: (id) => api.get(`/v1/customers/${id}/payments`),
  getReviews: (id) => api.get(`/v1/customers/${id}/reviews`),
  getMessages: (params = {}) => api.get('/v1/customer-messages', { params }),
  sendMessage: (data) => api.post('/v1/customer-messages', data),
};

// ============================================================
// EVENT API
// ============================================================

export const eventAPI = {
  getEvents: (params = {}) => api.get('/v1/events', { params }),
  getEvent: (id) => api.get(`/v1/events/${id}`),
  getStats: () => api.get('/v1/events/stats'),
  assignStaff: (eventId, data) => api.post(`/v1/events/${eventId}/staff`, data),
  getStaff: (eventId) => api.get(`/v1/events/${eventId}/staff`),
  getChecklist: (eventId) => api.get(`/v1/events/${eventId}/checklist`),
  getDeliveries: (eventId) => api.get(`/v1/events/${eventId}/deliveries`),
  getEquipment: (eventId) => api.get(`/v1/events/${eventId}/equipment`),
  getDailyProgress: (eventId) => api.get(`/v1/events/${eventId}/daily-progress`),
  completeEvent: (eventId) => api.post(`/v1/events/${eventId}/complete`),
  returnEquipment: (eventCode, data) =>
    api.post(`/v1/events/${eventCode}/return-equipment`, data),
};

// ============================================================
// INVENTORY API
// ============================================================

export const inventoryAPI = {
  getIngredients: (params = {}) => api.get('/v1/ingredients', { params }),
  getIngredient: (id) => api.get(`/v1/ingredients/${id}`),
  createIngredient: (data) => api.post('/v1/ingredients', data),
  updateIngredient: (id, data) => api.put(`/v1/ingredients/${id}`, data),
  deleteIngredient: (id) => api.delete(`/v1/ingredients/${id}`),
  updateStock: (id, data) => api.put(`/v1/ingredients/${id}/stock`, data),
  getLowStock: (params = {}) => api.get('/v1/ingredients/low-stock', { params }),
  getMovements: (params = {}) => api.get('/v1/inventory/movements', { params }),
  recordMovement: (data) => api.post('/v1/inventory/movements', data),
  getDashboardStats: () => api.get('/v1/inventory/dashboard-stats'),
};

// ============================================================
// EQUIPMENT API
// ============================================================

export const equipmentAPI = {
  getEquipment: (params = {}) => api.get('/v1/equipment', { params }),
  getEquipmentItem: (id) => api.get(`/v1/equipment/${id}`),
  createEquipment: (data) => api.post('/v1/equipment', data),
  updateEquipment: (id, data) => api.put(`/v1/equipment/${id}`, data),
  deleteEquipment: (id) => api.delete(`/v1/equipment/${id}`),
  getStats: () => api.get('/v1/equipment/stats'),
  getHistory: (id) => api.get(`/v1/equipment/${id}/history`),
  reserve: (id, data) => api.post(`/v1/equipment/${id}/reserve`, data),
};

// ============================================================
// EXPORT DEFAULT
// ============================================================

export default api;