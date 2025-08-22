const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const ActivityLog = require("../models/ActivityLog");
const { isValidEmail, isValidPhone, isValidPinCode } = require('../middleware/sanitize');

// Register user
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({
      name,
      email,
      password,
      passwordLastChanged: new Date()
    });

    await ActivityLog.create({
      user: user._id,
      action: 'register',
      status: 'success',
      details: { name, email },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt for email:", email);

    // Validate input
    if (!email || !password) {
      console.log("Login failed: Missing credentials");
      return res.status(400).json({ message: "Please provide email and password" });
    }

    // Check for user email
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      console.log("Login failed: User not found:", email);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if account is locked
    if (user.isAccountLocked()) {
      const remainingTime = Math.ceil((user.accountLockUntil - new Date()) / (60 * 1000));
      await ActivityLog.create({
        user: user._id,
        action: 'failed_login',
        status: 'failure',
        details: { reason: 'Account locked', remainingMinutes: remainingTime },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({ 
        message: `Account is locked. Please try again in ${remainingTime} minutes.` 
      });
    }

    // Check if password is expired
    if (user.isPasswordExpired()) {
      await ActivityLog.create({
        user: user._id,
        action: 'failed_login',
        status: 'failure',
        details: { reason: 'Password expired' },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({ 
        message: "Your password has expired. Please reset your password." 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment failed login attempts
      await user.incrementLoginAttempts();
      
      await ActivityLog.create({
        user: user._id,
        action: 'failed_login',
        status: 'failure',
        details: { 
          reason: 'Invalid password',
          attemptNumber: user.failedLoginAttempts,
          isLocked: user.failedLoginAttempts >= 5
        },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      if (user.failedLoginAttempts >= 5) {
        return res.status(401).json({ 
          message: "Account locked due to too many failed attempts. Please try again in 30 minutes." 
        });
      }

      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Reset failed login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Set session data
    req.session.userId = user._id;
    req.session.userRole = user.role;

    const response = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: token,
    };

    // Log successful login
    await ActivityLog.create({
      user: user._id,
      action: 'login',
      status: 'success',
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json(response);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    // Log the logout action before destroying the session
    if (req.user) {
      await ActivityLog.create({
        user: req.user._id,
        action: 'logout',
        status: 'success',
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ message: "Error logging out" });
      }
      res.clearCookie('connect.sid');
      res.status(200).json({ message: "Logged out successfully" });
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.user._id;

    if (!name || !email) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const changes = {};
    if (name !== user.name) changes.name = { from: user.name, to: name };
    if (email !== user.email) changes.email = { from: user.email, to: email };

    user.name = name;
    user.email = email;
    await user.save();

    await ActivityLog.create({
      user: userId,
      action: 'profile_update',
      status: 'success',
      details: Object.keys(changes).length > 0 ? changes : { message: 'No changes made' },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    const userObject = user.toObject();
    delete userObject.password;

    res.json(userObject);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate password requirements
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      await ActivityLog.create({
        user: user._id,
        action: 'password_change',
        status: 'failure',
        details: { reason: 'Password requirements not met' },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(400).json({ 
        message: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character" 
      });
    }

    // Check if current password matches
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      await ActivityLog.create({
        user: user._id,
        action: 'password_change',
        status: 'failure',
        details: { reason: 'Incorrect current password' },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      await ActivityLog.create({
        user: user._id,
        action: 'password_change',
        status: 'failure',
        details: { reason: 'New password same as current password' },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    // Check if password was used before
    if (await user.isPasswordReused(newPassword)) {
      await ActivityLog.create({
        user: user._id,
        action: 'password_change',
        status: 'failure',
        details: { reason: 'Password previously used' },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(400).json({ message: "Cannot reuse any of your last 5 passwords" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Log successful password change
    await ActivityLog.create({
      user: user._id,
      action: 'password_change',
      status: 'success',
      details: { message: 'Password updated successfully' },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    if (req.user) {
      await ActivityLog.create({
        user: req.user._id,
        action: 'password_change',
        status: 'failure',
        details: { error: error.message },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    res.status(500).json({ message: "Server Error" });
  }
};

// Generate JWT
const generateToken = (id) => {
  try {
    const token = jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    console.log("JWT generated successfully for user ID:", id);
    return token;
  } catch (error) {
    console.error("Error generating JWT:", error);
    throw error;
  }
};

// @desc    Add a new address
// @route   POST /api/auth/address
// @access  Private
const addAddress = async (req, res) => {
  try {
    const { fullName, phone, address, city, state, pinCode, isDefault } = req.body;
    const userId = req.user._id;

    if (!fullName || !phone || !address || !city || !state || !pinCode) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Please provide a valid phone number' });
    }

    if (!isValidPinCode(pinCode)) {
      return res.status(400).json({ message: 'Please provide a valid PIN code' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newAddress = {
      fullName,
      phone,
      address,
      city,
      state,
      pinCode,
      isDefault: isDefault || false
    };

    if (isDefault) {
      user.addresses.forEach(addr => addr.isDefault = false);
    }

    user.addresses.push(newAddress);
    await user.save();

    await ActivityLog.create({
      user: userId,
      action: 'address_add',
      status: 'success',
      details: {
        addressId: user.addresses[user.addresses.length - 1]._id,
        isDefault: newAddress.isDefault
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json(user.addresses);
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ message: 'Error adding address' });
  }
};

// @desc    Get all addresses
// @route   GET /api/auth/address
// @access  Private
const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.addresses);
  } catch (error) {
    console.error("Error getting addresses:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update an address
// @route   PUT /api/auth/address/:addressId
// @access  Private
const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    const { fullName, phone, address: newAddress, city, state, pinCode } = req.body;

    // Track changes for logging
    const changes = {
      fullName: { from: address.fullName, to: fullName },
      phone: { from: address.phone, to: phone },
      address: { from: address.address, to: newAddress },
      city: { from: address.city, to: city },
      state: { from: address.state, to: state },
      pinCode: { from: address.pinCode, to: pinCode }
    };

    // Only keep fields that actually changed
    Object.keys(changes).forEach(key => {
      if (changes[key].from === changes[key].to) {
        delete changes[key];
      }
    });

    // Update address fields
    address.fullName = fullName;
    address.phone = phone;
    address.address = newAddress;
    address.city = city;
    address.state = state;
    address.pinCode = pinCode;

    await user.save();

    // Log successful address update
    await ActivityLog.create({
      user: user._id,
      action: 'address_update',
      status: 'success',
      details: {
        addressId: address._id,
        changes,
        isDefault: address.isDefault
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      message: "Address updated successfully",
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    // Log failed address update
    if (req.user) {
      await ActivityLog.create({
        user: req.user._id,
        action: 'address_update',
        status: 'failure',
        details: {
          addressId: req.params.addressId,
          error: error.message
        },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete an address
// @route   DELETE /api/auth/address/:addressId
// @access  Private
const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    // Store address details before deletion for logging
    const addressDetails = {
      fullName: address.fullName,
      address: address.address,
      city: address.city,
      state: address.state,
      pinCode: address.pinCode,
      isDefault: address.isDefault
    };

    // Remove the address using pull
    user.addresses.pull(req.params.addressId);
    await user.save();

    // Log successful address deletion
    await ActivityLog.create({
      user: user._id,
      action: 'address_delete',
      status: 'success',
      details: {
        addressId: req.params.addressId,
        deletedAddress: addressDetails
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      message: "Address deleted successfully",
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    // Log failed address deletion
    if (req.user) {
      await ActivityLog.create({
        user: req.user._id,
        action: 'address_delete',
        status: 'failure',
        details: {
          addressId: req.params.addressId,
          error: error.message
        },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Set an address as default
// @route   PUT /api/auth/address/:addressId/default
// @access  Private
const setDefaultAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    // Find current default address
    const previousDefault = user.addresses.find(addr => addr.isDefault);
    const previousDefaultId = previousDefault ? previousDefault._id : null;

    // Remove default from all addresses
    user.addresses.forEach((addr) => {
      addr.isDefault = false;
    });

    // Set new default
    address.isDefault = true;
    await user.save();

    // Log successful default address change
    await ActivityLog.create({
      user: user._id,
      action: 'address_set_default',
      status: 'success',
      details: {
        newDefaultAddressId: address._id,
        previousDefaultAddressId: previousDefaultId,
        address: {
          fullName: address.fullName,
          address: address.address,
          city: address.city,
          state: address.state,
          pinCode: address.pinCode
        }
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      message: "Default address updated",
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Error setting default address:", error);
    // Log failed default address change
    if (req.user) {
      await ActivityLog.create({
        user: req.user._id,
        action: 'address_set_default',
        status: 'failure',
        details: {
          addressId: req.params.addressId,
          error: error.message
        },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Get activity logs
const getActivityLogs = async (req, res) => {
    try {
        const logs = await ActivityLog.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(100); // Get last 100 logs

        res.status(200).json(logs);
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        res.status(500).json({ message: 'Error fetching activity logs' });
    }
};

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getActivityLogs,
};
