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
   * Transform a pkg (room set) to OpenAI product format
   * @param {Object} pkg - RTG pkg from MongoDB
   * @returns {Object} OpenAI-compliant product object
   */
  transformPackage(pkg) {
    const region = pkg.region || this.defaultRegion;

    // Calculate total price for the room set
    const totalPrice = this.calculateTotalPrice(pkg, region);

    // Get primary image from first slot item
    const primaryImage = this.getPrimaryImage(pkg);

    // Build product title
    const title = this.buildTitle(pkg);

    // Build description
    const description = this.buildDescription(pkg);

    // Get product URL
    const link = this.buildProductUrl(pkg);

    // Determine availability
    const availability = this.determineAvailability(pkg, region);

    // Build variants (if color/style variations exist)
    const variants = this.buildVariants(pkg);

    return {
      // Required fields
      id: pkg.container_id || pkg._id,
      title: title,
      description: description,
      link: link,
      price: {
        value: totalPrice,
        currency: this.currency,
      },
      availability: availability,
      inventory_quantity: this.getInventoryQuantity(pkg, region),

      // Highly recommended fields
      brand: "Rooms To Go",
      image_link: primaryImage,
      additional_image_links: this.getAdditionalImages(pkg),

      // Optional but valuable fields
      product_type: this.getProductType(pkg),
      google_product_category: this.getGoogleCategory(pkg),
      condition: "new",

      // Custom attributes
      custom_attributes: {
        collection: pkg._collection || "",
        slot_key: pkg.slot_key || "",
        piece_count: pkg.piece_count || 0,
        delivery_type: pkg.delivery_type || "",
        region: region,
        savings: pkg.savings?.[region] || 0,
        catalog: pkg.catalog || "",
        category: pkg.category || "",
      },

      // Variants (colors/styles)
      ...(variants.length > 0 && { variants }),

      // Commerce features
      enable_search: true,
      enable_checkout: true,

      // Metadata
      updated_at: pkg.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Calculate total price for room set
   * @param {Object} pkg
   * @param {string} region
   * @returns {number}
   */
  calculateTotalPrice(pkg, region) {
    if (!pkg.slots || !Array.isArray(pkg.slots)) {
      return 0;
    }

    let totalPrice = 0;

    pkg.slots.forEach((slot) => {
      if (slot.filler_skus && Array.isArray(slot.filler_skus)) {
        slot.filler_skus.forEach((filler) => {
          const quantity = filler.quantity || 1;
          const price = filler.price?.[region]?.["0_sale_price"] || 0;
          totalPrice += price * quantity;
        });
      }
    });

    return parseFloat(totalPrice.toFixed(2));
  }

  /**
   * Get primary image for the package
   * @param {Object} pkg
   * @returns {string}
   */
  getPrimaryImage(pkg) {
    // Try to get from first slot's first item
    if (pkg.slots?.[0]?.filler_skus?.[0]?.images?.primary_image) {
      return pkg.slots[0].filler_skus[0].images.primary_image;
    }

    // Try to get from first slot's first item image field
    if (pkg.slots?.[0]?.filler_skus?.[0]?.image) {
      return pkg.slots[0].filler_skus[0].image;
    }

    return "";
  }

  /**
   * Get additional images
   * @param {Object} pkg
   * @returns {Array<string>}
   */
  getAdditionalImages(pkg) {
    const images = [];

    if (pkg.slots && Array.isArray(pkg.slots)) {
      pkg.slots.forEach((slot) => {
        if (slot.filler_skus && Array.isArray(slot.filler_skus)) {
          slot.filler_skus.forEach((filler) => {
            if (
              filler.images?.alternate_images &&
              Array.isArray(filler.images.alternate_images)
            ) {
              images.push(...filler.images.alternate_images);
            }
          });
        }
      });
    }

    // Return unique images, limit to first 10
    return [...new Set(images)].slice(0, 10);
  }

  /**
   * Build product title
   * @param {Object} pkg
   * @returns {string}
   */
  buildTitle(pkg) {
    const collection = pkg._collection || "Room Set";
    const category = pkg.category || "Furniture";
    const pieceCount = pkg.piece_count || 0;

    // Format: "Belcourt Bedroom 5-Piece Set"
    const formattedCollection = this.capitalize(collection);
    const formattedCategory = this.capitalize(category);

    let title = `${formattedCollection} ${formattedCategory}`;
    if (pieceCount > 0) {
      title += ` ${pieceCount}-Piece Set`;
    }

    // Truncate to 150 characters per OpenAI spec
    return title.substring(0, 150);
  }

  /**
   * Build product description
   * @param {Object} pkg
   * @returns {string}
   */
  buildDescription(pkg) {
    const collection = this.capitalize(pkg._collection || "Collection");
    const category = this.capitalize(pkg.category || "furniture");
    const pieceCount = pkg.piece_count || 0;
    const region = pkg.region || this.defaultRegion;
    const savings = pkg.savings?.[region] || 0;

    let description = `Complete ${pieceCount}-piece ${collection} ${category} set. `;

    // Add pieces information
    if (pkg.slots && Array.isArray(pkg.slots)) {
      const pieces = pkg.slots
        .map((slot) => {
          const itemCount = slot.filler_skus?.length || 0;
          if (itemCount > 0) {
            const itemName =
              slot.filler_skus[0]?.gen_name || slot.sub_category || "";
            return itemCount > 1 ? `${itemCount} ${itemName}s` : itemName;
          }
          return slot.sub_category || "";
        })
        .filter(Boolean);

      if (pieces.length > 0) {
        description += `Includes: ${pieces.join(", ")}. `;
      }
    }

    // Add delivery information
    if (pkg.delivery_type === "D") {
      description += `Delivery available. `;
    }

    // Add savings information
    if (savings > 0) {
      description += `Save $${savings.toFixed(2)} on this set! `;
    }

    // Add style/color information from first item
    const firstItem = pkg.slots?.[0]?.filler_skus?.[0];
    if (firstItem) {
      if (firstItem.color) {
        description += `Available in ${firstItem.color}. `;
      }
      if (firstItem.additional_properties?.style) {
        description += `Style: ${firstItem.additional_properties.style}. `;
      }
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
    // Try to get route from first slot item
    const firstRoute = pkg.slots?.[0]?.filler_skus?.[0]?.route;

    if (firstRoute) {
      return `${this.baseUrl}${firstRoute}`;
    }

    // Fallback: generate URL from pkg ID
    const collection = pkg._collection || "furniture";
    const pkgId = pkg.container_id || pkg._id;
    return `${this.baseUrl}/${collection}/${pkgId}`;
  }

  /**
   * Determine availability status
   * @param {Object} pkg
   * @param {string} region
   * @returns {string}
   */
  determineAvailability(pkg, region) {
    // Check if all items are available in the region
    if (pkg.slots && Array.isArray(pkg.slots)) {
      const allAvailable = pkg.slots.every((slot) => {
        if (!slot.filler_skus || !Array.isArray(slot.filler_skus)) {
          return false;
        }
        return slot.filler_skus.every((filler) => {
          return filler.catalog_availability?.[region] === true;
        });
      });

      return allAvailable ? "in_stock" : "out_of_stock";
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
    // For room sets, we'll return a conservative estimate
    // In a real scenario, this would query actual inventory
    const isAvailable =
      this.determineAvailability(pkg, region) === "in_stock";
    return isAvailable ? 5 : 0; // Conservative stock estimate
  }

  /**
   * Get product type
   * @param {Object} pkg
   * @returns {string}
   */
  getProductType(pkg) {
    const category = this.capitalize(pkg.category || "Furniture");
    const pieceCount = pkg.piece_count || 0;
    return `${category} > ${pieceCount}-Piece Set`;
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
      dining: "Furniture > Dining Room Furniture",
      office: "Furniture > Office Furniture",
    };

    return categoryMap[category] || "Furniture";
  }

  /**
   * Build product variants (different colors/styles)
   * @param {Object} pkg
   * @returns {Array}
   */
  buildVariants(pkg) {
    const variants = [];

    if (
      pkg.slots?.[0]?.filler_skus &&
      pkg.slots[0].filler_skus.length > 1
    ) {
      pkg.slots[0].filler_skus.forEach((filler, index) => {
        if (index > 0 && filler.color) {
          // Skip first as it's the main product
          variants.push({
            id: filler.sku,
            color: filler.color,
            image_link: filler.images?.primary_image || filler.image,
            price: {
              value:
                filler.price?.[pkg.region || this.defaultRegion]?.[
                  "0_sale_price"
                ] || 0,
              currency: this.currency,
            },
          });
        }
      });
    }

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
    const products = packages.map((pkg) =>
      this.transformPackage(pkg)
    );

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
