import {
  handleOptions,
  json,
  readBody,
  requireBearer
} from "../lib/http.js";
import {
  errorPayload,
  getLocationId,
  graphql
} from "../lib/shopify.js";

const clean = (value) =>
  typeof value === "string" ? value.trim() : "";

function tags(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map(clean).filter(Boolean);
  }
  return [];
}

function weightUnit(value) {
  const units = {
    kg: "KILOGRAMS",
    g: "GRAMS",
    lb: "POUNDS",
    lbs: "POUNDS",
    oz: "OUNCES"
  };
  return units[String(value || "kg").toLowerCase()] || "KILOGRAMS";
}

function filenameFromUrl(url, index) {
  try {
    const name = new URL(url).pathname.split("/").pop();
    if (name && name.includes(".")) return name;
  } catch {}
  return `product-image-${index + 1}.jpg`;
}

function normalizeOptions(inputOptions) {
  if (!Array.isArray(inputOptions) || inputOptions.length === 0) {
    return [{
      name: "Title",
      position: 1,
      values: [{ name: "Default Title" }]
    }];
  }

  return inputOptions.map((option, index) => {
    const name = clean(option?.name);
    const values = Array.isArray(option?.values)
      ? option.values.map((value) => ({
          name: clean(typeof value === "string" ? value : value?.name)
        })).filter((value) => value.name)
      : [];

    if (!name || values.length === 0) {
      throw new Error("每个规格都必须填写name和values");
    }

    return {
      name,
      position: index + 1,
      values
    };
  });
}

async function normalizeVariants(body, hasCustomOptions) {
  const list = Array.isArray(body.variants) && body.variants.length
    ? body.variants
    : [{
        sku: body.sku,
        price: body.price,
        compareAtPrice: body.compareAtPrice,
        cost: body.cost,
        inventoryQuantity: body.inventoryQuantity,
        weight: body.weight,
        weightUnit: body.weightUnit,
        requiresShipping: body.requiresShipping
      }];

  const needsLocation = list.some((variant) =>
    variant.inventoryQuantity !== undefined &&
    variant.inventoryQuantity !== null &&
    variant.inventoryQuantity !== ""
  );
  const locationId = needsLocation ? await getLocationId() : "";

  return list.map((variant, index) => {
    if (
      variant.price === undefined ||
      variant.price === null ||
      variant.price === ""
    ) {
      throw new Error(`第${index + 1}个SKU缺少销售价price`);
    }

    let optionValues;
    if (hasCustomOptions) {
      if (!Array.isArray(variant.optionValues) || variant.optionValues.length === 0) {
        throw new Error(`第${index + 1}个SKU缺少optionValues`);
      }
      optionValues = variant.optionValues.map((item) => ({
        optionName: clean(item.optionName),
        name: clean(item.name)
      }));
    } else {
      optionValues = [{ optionName: "Title", name: "Default Title" }];
    }

    const inventoryItem = {
      tracked: Boolean(locationId),
      requiresShipping: variant.requiresShipping !== false
    };

    if (clean(variant.sku)) inventoryItem.sku = clean(variant.sku);

    if (
      variant.cost !== undefined &&
      variant.cost !== null &&
      variant.cost !== ""
    ) {
      inventoryItem.cost = String(variant.cost);
    }

    if (
      variant.weight !== undefined &&
      variant.weight !== null &&
      variant.weight !== ""
    ) {
      inventoryItem.measurement = {
        weight: {
          value: Number(variant.weight),
          unit: weightUnit(variant.weightUnit)
        }
      };
    }

    const result = {
      optionValues,
      price: String(variant.price),
      taxable: variant.taxable !== false,
      inventoryPolicy:
        String(variant.inventoryPolicy || "DENY").toUpperCase() === "CONTINUE"
          ? "CONTINUE"
          : "DENY",
      inventoryItem
    };

    if (clean(variant.sku)) result.sku = clean(variant.sku);
    if (clean(variant.barcode)) result.barcode = clean(variant.barcode);

    if (
      variant.compareAtPrice !== undefined &&
      variant.compareAtPrice !== null &&
      variant.compareAtPrice !== ""
    ) {
      result.compareAtPrice = String(variant.compareAtPrice);
    }

    if (locationId) {
      result.inventoryQuantities = [{
        locationId,
        name: "available",
        quantity: Number(variant.inventoryQuantity || 0)
      }];
    }

    return result;
  });
}

function normalizeFiles(images) {
  if (!Array.isArray(images)) return [];

  return images
    .map((image, index) => {
      const source = clean(image?.originalSource || image?.url);
      if (!/^https:\/\//i.test(source)) return null;

      return {
        originalSource: source,
        alt: clean(image?.alt) || null,
        filename: clean(image?.filename) || filenameFromUrl(source, index),
        contentType: "IMAGE"
      };
    })
    .filter(Boolean);
}

async function listProducts(req, res) {
  const requested = Number(req.query?.limit || 3);
  const first = Math.min(Math.max(requested || 3, 1), 25);

  const data = await graphql(`
    query LatestProducts($first: Int!) {
      products(first: $first, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          status
          vendor
          productType
          totalInventory
          createdAt
          seo {
            title
            description
          }
          variants(first: 50) {
            nodes {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              inventoryItem {
                measurement {
                  weight {
                    value
                    unit
                  }
                }
              }
            }
          }
          media(first: 20) {
            nodes {
              id
              alt
              mediaContentType
              status
            }
          }
        }
      }
    }
  `, { first });

  return json(res, 200, {
    ok: true,
    count: data.products.nodes.length,
    products: data.products.nodes
  });
}

async function createDraftProduct(req, res) {
  const body = readBody(req);
  const title = clean(body.title);

  if (!title) {
    return json(res, 400, {
      ok: false,
      error: "缺少产品标题title"
    });
  }

  const productOptions = normalizeOptions(body.options);
  const hasCustomOptions = !(
    productOptions.length === 1 &&
    productOptions[0].name === "Title" &&
    productOptions[0].values[0]?.name === "Default Title"
  );

  const variants = await normalizeVariants(body, hasCustomOptions);
  const files = normalizeFiles(body.images);

  const productSet = {
    title,
    status: "DRAFT",
    productOptions,
    variants
  };

  if (clean(body.descriptionHtml)) {
    productSet.descriptionHtml = clean(body.descriptionHtml);
  }
  if (clean(body.vendor)) productSet.vendor = clean(body.vendor);
  if (clean(body.productType)) productSet.productType = clean(body.productType);
  if (clean(body.handle)) productSet.handle = clean(body.handle);

  const productTags = tags(body.tags);
  if (productTags.length) productSet.tags = productTags;

  if (clean(body.seoTitle) || clean(body.seoDescription)) {
    productSet.seo = {};
    if (clean(body.seoTitle)) productSet.seo.title = clean(body.seoTitle);
    if (clean(body.seoDescription)) {
      productSet.seo.description = clean(body.seoDescription);
    }
  }

  if (Array.isArray(body.collectionIds) && body.collectionIds.length) {
    productSet.collections = body.collectionIds.map(clean).filter(Boolean);
  }

  if (files.length) productSet.files = files;

  const data = await graphql(`
    mutation CreateDraftProduct(
      $productSet: ProductSetInput!
      $synchronous: Boolean!
    ) {
      productSet(input: $productSet, synchronous: $synchronous) {
        product {
          id
          title
          handle
          status
          vendor
          productType
          tags
          seo {
            title
            description
          }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              inventoryItem {
                measurement {
                  weight {
                    value
                    unit
                  }
                }
              }
            }
          }
          media(first: 50) {
            nodes {
              id
              alt
              mediaContentType
              status
            }
          }
        }
        userErrors {
          code
          field
          message
        }
      }
    }
  `, {
    productSet,
    synchronous: true
  });

  const result = data.productSet;

  if (result.userErrors?.length) {
    return json(res, 400, {
      ok: false,
      error: "Shopify拒绝创建产品",
      details: result.userErrors
    });
  }

  return json(res, 201, {
    ok: true,
    message: "产品已创建为Draft草稿，未发布。",
    product: result.product,
    safety: {
      forcedStatus: "DRAFT",
      published: false
    }
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireBearer(req, res)) return;

  try {
    if (req.method === "GET") return await listProducts(req, res);
    if (req.method === "POST") return await createDraftProduct(req, res);

    return json(res, 405, {
      ok: false,
      error: "只支持GET或POST"
    });
  } catch (error) {
    return json(res, error.status || 500, errorPayload(error));
  }
}
