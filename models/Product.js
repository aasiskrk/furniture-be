const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Living Room",
        "Bedroom",
        "Dining Room",
        "Kitchen",
        "Office",
        "Outdoor",
        "Kids",
        "Storage",
        "Other",
      ],
    },
    subCategory: {
      type: String,
      required: true,
      enum: [
        // Living Room
        "Sofas",
        "Coffee Tables",
        "TV Stands",
        "Armchairs",
        "Side Tables",
        "Bookcases",

        // Bedroom
        "Beds",
        "Wardrobes",
        "Dressers",
        "Nightstands",
        "Bedroom Sets",
        "Mattresses",

        // Dining Room
        "Dining Tables",
        "Dining Chairs",
        "Dining Sets",
        "Buffets & Sideboards",
        "Bar Furniture",

        // Kitchen
        "Kitchen Islands",
        "Bar Stools",
        "Kitchen Storage",
        "Kitchen Tables",
        "Kitchen Chairs",

        // Office
        "Desks",
        "Office Chairs",
        "Filing Cabinets",
        "Office Sets",

        // Outdoor
        "Outdoor Sets",
        "Outdoor Tables",
        "Outdoor Chairs",
        "Outdoor Sofas",
        "Garden Furniture",

        // Kids
        "Kids Beds",
        "Study Tables",
        "Storage Units",
        "Play Furniture",
        "Kids Chairs",

        // Storage
        "Cabinets",
        "Shelving Units",
        "Storage Boxes",
        "Wall Storage",
        "Shoe Storage",
        "Coat Racks",

        // Other
        "Mirrors",
        "Room Dividers",
        "Bean Bags",
        "Accent Furniture",
        "Decorative Items",
        "Miscellaneous",
      ],
    },
    dimensions: {
      length: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true },
      unit: { type: String, default: "inches", enum: ["inches", "cm"] },
    },
    colors: [
      {
        name: { type: String, required: true },
        code: { type: String, required: true }, // Hex color code
      },
    ],
    material: {
      type: String,
      required: true,
    },
    pictures: [
      {
        type: String,
        required: true,
      },
    ],
    features: [
      {
        type: String,
      },
    ],

    weight: {
      value: { type: Number, required: true },
      unit: { type: String, default: "kg", enum: ["kg", "lbs"] },
    },
    countInStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Product", productSchema);
