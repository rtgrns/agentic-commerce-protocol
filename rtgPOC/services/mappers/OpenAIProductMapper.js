/**
 * OpenAI Commerce Product Feed Mapper
 *
 * Transforms RTG container/product data to OpenAI Commerce Feed Specification
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
   * Transform a container (room set) to OpenAI product format
   * @param {Object} container - RTG container from MongoDB
   * @returns {Object} OpenAI-compliant product object
   */
  transformContainer(container) {
    const region = container.region || this.defaultRegion;

    // Calculate total price for the room set
    const totalPrice = this.calculateTotalPrice(container, region);

    // Get primary image from first slot item
    const primaryImage = this.getPrimaryImage(container);

    // Build product title
    const title = this.buildTitle(container);

    // Build description
    const description = this.buildDescription(container);

    // Get product URL
    const link = this.buildProductUrl(container);

    // Determine availability
    const availability = this.determineAvailability(container, region);

    // Build variants (if color/style variations exist)
    const variants = this.buildVariants(container);

    return {
      // Required fields
      id: container.container_id || container._id,
      title: title,
      description: description,
      link: link,
      price: {
        value: totalPrice,
        currency: this.currency,
      },
      availability: availability,
      inventory_quantity: this.getInventoryQuantity(container, region),

      // Highly recommended fields
      brand: "Rooms To Go",
      image_link: primaryImage,
      additional_image_links: this.getAdditionalImages(container),

      // Optional but valuable fields
      product_type: this.getProductType(container),
      google_product_category: this.getGoogleCategory(container),
      condition: "new",

      // Custom attributes
      custom_attributes: {
        collection: container._collection || "",
        slot_key: container.slot_key || "",
        piece_count: container.piece_count || 0,
        delivery_type: container.delivery_type || "",
        region: region,
        savings: container.savings?.[region] || 0,
        catalog: container.catalog || "",
        category: container.category || "",
      },

      // Variants (colors/styles)
      ...(variants.length > 0 && { variants }),

      // Commerce features
      enable_search: true,
      enable_checkout: true,

      // Metadata
      updated_at: container.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Calculate total price for room set
   * @param {Object} container
   * @param {string} region
   * @returns {number}
   */
  calculateTotalPrice(container, region) {
    if (!container.slots || !Array.isArray(container.slots)) {
      return 0;
    }

    let totalPrice = 0;

    container.slots.forEach((slot) => {
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
   * Get primary image for the container
   * @param {Object} container
   * @returns {string}
   */
  getPrimaryImage(container) {
    // Try to get from first slot's first item
    if (container.slots?.[0]?.filler_skus?.[0]?.images?.primary_image) {
      return container.slots[0].filler_skus[0].images.primary_image;
    }

    // Try to get from first slot's first item image field
    if (container.slots?.[0]?.filler_skus?.[0]?.image) {
      return container.slots[0].filler_skus[0].image;
    }

    return "";
  }

  /**
   * Get additional images
   * @param {Object} container
   * @returns {Array<string>}
   */
  getAdditionalImages(container) {
    const images = [];

    if (container.slots && Array.isArray(container.slots)) {
      container.slots.forEach((slot) => {
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
   * @param {Object} container
   * @returns {string}
   */
  buildTitle(container) {
    const collection = container._collection || "Room Set";
    const category = container.category || "Furniture";
    const pieceCount = container.piece_count || 0;

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
   * @param {Object} container
   * @returns {string}
   */
  buildDescription(container) {
    const collection = this.capitalize(container._collection || "Collection");
    const category = this.capitalize(container.category || "furniture");
    const pieceCount = container.piece_count || 0;
    const region = container.region || this.defaultRegion;
    const savings = container.savings?.[region] || 0;

    let description = `Complete ${pieceCount}-piece ${collection} ${category} set. `;

    // Add pieces information
    if (container.slots && Array.isArray(container.slots)) {
      const pieces = container.slots
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
    if (container.delivery_type === "D") {
      description += `Delivery available. `;
    }

    // Add savings information
    if (savings > 0) {
      description += `Save $${savings.toFixed(2)} on this set! `;
    }

    // Add style/color information from first item
    const firstItem = container.slots?.[0]?.filler_skus?.[0];
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
   * @param {Object} container
   * @returns {string}
   */
  buildProductUrl(container) {
    // Try to get route from first slot item
    const firstRoute = container.slots?.[0]?.filler_skus?.[0]?.route;

    if (firstRoute) {
      return `${this.baseUrl}${firstRoute}`;
    }

    // Fallback: generate URL from container ID
    const collection = container._collection || "furniture";
    const containerId = container.container_id || container._id;
    return `${this.baseUrl}/${collection}/${containerId}`;
  }

  /**
   * Determine availability status
   * @param {Object} container
   * @param {string} region
   * @returns {string}
   */
  determineAvailability(container, region) {
    // Check if all items are available in the region
    if (container.slots && Array.isArray(container.slots)) {
      const allAvailable = container.slots.every((slot) => {
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
   * @param {Object} container
   * @param {string} region
   * @returns {number}
   */
  getInventoryQuantity(container, region) {
    // For room sets, we'll return a conservative estimate
    // In a real scenario, this would query actual inventory
    const isAvailable =
      this.determineAvailability(container, region) === "in_stock";
    return isAvailable ? 5 : 0; // Conservative stock estimate
  }

  /**
   * Get product type
   * @param {Object} container
   * @returns {string}
   */
  getProductType(container) {
    const category = this.capitalize(container.category || "Furniture");
    const pieceCount = container.piece_count || 0;
    return `${category} > ${pieceCount}-Piece Set`;
  }

  /**
   * Get Google product category
   * @param {Object} container
   * @returns {string}
   */
  getGoogleCategory(container) {
    const category = container.category?.toLowerCase() || "";

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
   * @param {Object} container
   * @returns {Array}
   */
  buildVariants(container) {
    const variants = [];

    if (
      container.slots?.[0]?.filler_skus &&
      container.slots[0].filler_skus.length > 1
    ) {
      container.slots[0].filler_skus.forEach((filler, index) => {
        if (index > 0 && filler.color) {
          // Skip first as it's the main product
          variants.push({
            id: filler.sku,
            color: filler.color,
            image_link: filler.images?.primary_image || filler.image,
            price: {
              value:
                filler.price?.[container.region || this.defaultRegion]?.[
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
   * Transform array of containers to OpenAI product feed
   * @param {Array} containers
   * @returns {Object} Complete feed structure
   */
  transformFeed(containers) {
    const products = containers.map((container) =>
      this.transformContainer(container)
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
