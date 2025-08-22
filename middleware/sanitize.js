const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const sanitizeData = (data) => {
    if (typeof data === 'string') {
        return DOMPurify.sanitize(data, { ALLOWED_TAGS: [] }).trim();
    }
    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item));
    }
    if (data && typeof data === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            // Skip password fields
            if (key.toLowerCase().includes('password')) {
                sanitized[key] = value;
                continue;
            }
            sanitized[key] = sanitizeData(value);
        }
        return sanitized;
    }
    return data;
};

const sanitizeMiddleware = (req, res, next) => {
    try {
       
        if (req.body) {
            req.body = sanitizeData(req.body);
        }
        if (req.query) {
            req.query = sanitizeData(req.query);
        }
        if (req.params) {
            req.params = sanitizeData(req.params);
        }
        next();
    } catch (error) {
        console.error('Sanitization error:', error);
        res.status(400).json({ message: 'Invalid input data' });
    }
};

// MongoDB ID validation
const isValidMongoId = (id) => {
    return /^[0-9a-fA-F]{24}$/.test(id);
};

// Email validation
const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
};

// Phone number validation
const isValidPhone = (phone) => {
    return /^\d{10}$/.test(phone);
};

// PIN/Postal code validation
const isValidPinCode = (pinCode) => {
    return /^\d{5,6}$/.test(pinCode);
};

module.exports = {
    sanitizeMiddleware,
    sanitizeData,
    isValidMongoId,
    isValidEmail,
    isValidPhone,
    isValidPinCode
}; 