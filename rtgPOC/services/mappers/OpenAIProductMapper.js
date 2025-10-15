/**
 * OpenAI Commerce Product Feed Mapper
 *
 * Transforms RTG package/product data to OpenAI Commerce Feed Specification
 * Spec: https://developers.openai.com/commerce/specs/feed
 *
 * Design Pattern: Adapter Pattern
 * Adapts internal RTG product schema to OpenAI's expected format
 */

class OpenAIProductMapper {
  constructor(config = {}) {
    this.merchantId =
      config.merchantId || process.env.MERCHANT_ID || "merchant_rtg";
    this.baseUrl =
      config.baseUrl || process.env.BASE_URL || "https://www.roomstogo.com";
    this.defaultRegion =
      config.defaultRegion || process.env.DEFAULT_REGION || "SE";
    this.currency = config.currency || "USD";
  }

  /**
   * Transform a package (room set) to OpenAI product format
   * @param {Object} pkg - RTG package from MongoDB
   * @returns {Object} OpenAI-compliant product object
   */
  transformPackage(pkg) {
    const region = pkg.region || this.defaultRegion;

    // Extract SKU from route or use a generated ID
    const productId = this.extractProductId(pkg);

    // Get pricing for the region
    const price = this.getPrice(pkg, region);

    // Determine availability
    const availability = this.determineAvailability(pkg, region);

    // Build variants (color variations)
    const variants = this.buildVariants(pkg, region);

    return {
      // Required fields
      id: productId,
      title: pkg.title || "Untitled Product",
      description: pkg.description || this.buildDescription(pkg),
      link: this.buildProductUrl(pkg),
      price: {
        value: price.sale_price || price.list_price,
        currency: this.currency,
      },
      availability: availability,
      inventory_quantity: this.getInventoryQuantity(pkg, region),

      // Highly recommended fields
      brand: pkg.brand ? this.capitalize(pkg.brand) : "Rooms To Go",
      image_link: pkg.primary_image || pkg.grid_image || "",
      additional_image_links: this.getAdditionalImages(pkg),

      // Optional but valuable fields
      product_type: this.getProductType(pkg),
      google_product_category: this.getGoogleCategory(pkg),
      condition: "new",

      // Custom attributes
      custom_attributes: {
        collection: pkg._collection || "",
        piece_count: pkg.piececount || 0,
        delivery_type: pkg.delivery_type || "",
        region: region,
        catalog: pkg.catalog || "",
        category: pkg.category || "",
        mpn: pkg.mpn || "",
        room_type_code: pkg.room_type_code || "",
        colors: pkg.color?.join(", ") || "",
        materials: pkg.material?.join(", ") || "",
        decor: pkg.decor?.join(", ") || "",
        on_sale: pkg.on_sale?.[`${region}_0`] || false,
        vendor_id: pkg.vendorId || "",
      },

      // Variants (colors/styles)
      ...(variants.length > 0 && { variants }),

      // Commerce features
      enable_search: true,
      enable_checkout: true,

      // Metadata
      updated_at: pkg.lastModified || pkg.createdAt || new Date().toISOString(),
    };
  }

  /**
   * Extract product ID from route or use SKU
   * @param {Object} pkg
   * @returns {string}
   */
  extractProductId(pkg) {
    if (pkg.route) {
      // Extract SKU from route: "/product-name/SKU123"
      const parts = pkg.route.split("/");
      return parts[parts.length - 1] || pkg.route;
    }
    return pkg._id || pkg.sku || `product_${Date.now()}`;
  }

  /**
   * Get price for a specific region
   * @param {Object} pkg
   * @param {string} region
   * @returns {Object} { list_price, sale_price }
   */
  getPrice(pkg, region) {
    if (!pkg.pricing) {
      return { list_price: 0, sale_price: 0 };
    }

    // Try region-specific pricing first (e.g., FL_0_sale_price)
    const salePrice =
      pkg.pricing[`${region}_0_sale_price`] || pkg.pricing.default_price || 0;
    const listPrice =
      pkg.pricing[`${region}_0_list_price`] || pkg.pricing.default_price || 0;

    return {
      list_price: parseFloat(listPrice),
      sale_price: parseFloat(salePrice),
    };
  }

  /**
   * Get additional images
   * @param {Object} pkg
   * @returns {Array<string>}
   */
  getAdditionalImages(pkg) {
    const images = [];

    // Add alternate images
    if (pkg.alternate_images && Array.isArray(pkg.alternate_images)) {
      images.push(...pkg.alternate_images);
    }

    // Add high res image if different from primary
    if (pkg.high_res_image && pkg.high_res_image !== pkg.primary_image) {
      images.push(pkg.high_res_image);
    }

    // Add logo image if present
    if (pkg.logo_image) {
      images.push(pkg.logo_image);
    }

    // Return unique images, limit to first 10
    return [...new Set(images)].slice(0, 10);
  }

  /**
   * Build product description (if not provided)
   * @param {Object} pkg
   * @returns {string}
   */
  buildDescription(pkg) {
    const collection = this.capitalize(pkg._collection || "Collection");
    const category = this.capitalize(pkg.category || "furniture");
    const pieceCount = pkg.piececount || 0;

    let description = `Complete ${pieceCount}-piece ${collection} ${category} set. `;

    // Add items in room
    if (pkg.items_in_room) {
      const region = pkg.region || this.defaultRegion;
      const items = pkg.items_in_room[region];

      if (items && Array.isArray(items)) {
        const itemNames = items
          .map((item) => {
            const qty = item.quantity || 1;
            const name = item.generic_name || item.title || "";
            return qty > 1 ? `${qty} ${name}s` : name;
          })
          .filter(Boolean);

        if (itemNames.length > 0) {
          description += `Includes: ${itemNames.join(", ")}. `;
        }
      }
    }

    // Add delivery information
    if (pkg.delivery_type === "D") {
      description += `Delivery available. `;
    }

    // Add material/color information
    if (pkg.material && pkg.material.length > 0) {
      description += `Material: ${pkg.material.join(", ")}. `;
    }

    if (pkg.color && pkg.color.length > 0) {
      description += `Available in ${pkg.color.join(", ")}. `;
    }

    // Add decor style
    if (pkg.decor && pkg.decor.length > 0) {
      description += `Style: ${pkg.decor.join(", ")}. `;
    }

    // Truncate to 5000 characters per OpenAI spec
    return description.substring(0, 5000);
  }

  /**
   * Build product URL
   * @param {Object} pkg
   * @returns {string}
   */
  buildProductUrl(pkg) {
    if (pkg.route) {
      return `${this.baseUrl}${pkg.route}`;
    }

    // Fallback: generate URL from title slug
    const slug = pkg.title_slug || this.slugify(pkg.title || "product");
    const productId = this.extractProductId(pkg);
    return `${this.baseUrl}/${slug}/${productId}`;
  }

  /**
   * Create URL-friendly slug
   * @param {string} text
   * @returns {string}
   */
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Determine availability status
   * @param {Object} pkg
   * @param {string} region
   * @returns {string}
   */
  determineAvailability(pkg, region) {
    if (pkg.catalog_availability && pkg.catalog_availability[region]) {
      return "in_stock";
    }

    // Check warehouse availability
    if (pkg.warehouseAvailability && pkg.warehouseAvailability[region]) {
      const warehouse = pkg.warehouseAvailability[region];
      if (warehouse.isAvailable || warehouse.dotcomAvailable) {
        return "in_stock";
      }
      return "preorder"; // Available but not in stock
    }

    return "out_of_stock";
  }

  /**
   * Get inventory quantity estimate
   * @param {Object} pkg
   * @param {string} region
   * @returns {number}
   */
  getInventoryQuantity(pkg, region) {
    const availability = this.determineAvailability(pkg, region);

    if (availability === "in_stock") {
      return 5; // Conservative estimate
    } else if (availability === "preorder") {
      return 0; // Not currently in stock
    }

    return 0;
  }

  /**
   * Get product type
   * @param {Object} pkg
   * @returns {string}
   */
  getProductType(pkg) {
    const category = this.capitalize(pkg.category || "Furniture");
    const pieceCount = pkg.piececount || 0;
    const type = pkg.type ? this.capitalize(pkg.type) : "";

    if (pieceCount > 0) {
      return `${category} > ${type} ${pieceCount}-Piece Set`.trim();
    }

    return `${category} > ${type}`.trim();
  }

  /**
   * Get Google product category
   * @param {Object} pkg
   * @returns {string}
   */
  getGoogleCategory(pkg) {
    const category = pkg.category?.toLowerCase() || "";

    // Map to Google product taxonomy
    const categoryMap = {
      bedroom: "Furniture > Bedroom Furniture",
      livingroom: "Furniture > Living Room Furniture",
      "living room": "Furniture > Living Room Furniture",
      dining: "Furniture > Dining Room Furniture",
      office: "Furniture > Office Furniture",
      tables: "Furniture > Tables",
      lighting: "Home & Garden > Lighting",
      accessories: "Home & Garden > Decor",
    };

    return categoryMap[category] || "Furniture";
  }

  /**
   * Build product variants (different colors/styles)
   * @param {Object} pkg
   * @param {string} region
   * @returns {Array}
   */
  buildVariants(pkg, region) {
    const variants = [];

    if (!pkg.variations || !pkg.variations.color) {
      return variants;
    }

    pkg.variations.color.forEach((variant) => {
      // Skip if not available in this region
      if (!variant.catalog_availability?.[region]) {
        return;
      }

      const pricing = this.getPrice(variant, region);

      variants.push({
        id: variant.sku,
        color: variant.variation_value || "",
        image_link: variant.primary_image || variant.image || "",
        price: {
          value: pricing.sale_price || pricing.list_price,
          currency: this.currency,
        },
        availability: variant.catalog_availability[region]
          ? "in_stock"
          : "out_of_stock",
      });
    });

    return variants;
  }

  /**
   * Capitalize first letter of each word
   * @param {string} str
   * @returns {string}
   */
  capitalize(str) {
    if (!str) return "";
    return str
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  /**
   * Transform array of packages to OpenAI product feed
   * @param {Array} packages
   * @returns {Object} Complete feed structure
   */
  transformFeed(packages) {
    const products = packages.map((pkg) => this.transformPackage(pkg));

    return {
      version: "1.0",
      merchant_id: this.merchantId,
      last_updated: new Date().toISOString(),
      total_products: products.length,
      products: products,
    };
  }
}

module.exports = OpenAIProductMapper;
