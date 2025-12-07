const API_BASE_URL = "http://localhost:8787/api/in/search";
const TARGET_PRODUCTS_PER_QUERY = 500;

interface SearchItem {
  id: string;
  productUrl: string;
  title: string;
  image: {
    original: string;
    small: string;
    medium: string;
    large: string;
  };
  currency: string;
  price: number;
  originalPrice: number;
  starRating: number;
  totalRatings: number;
  apiUrl: string;
}

interface SearchResponse {
  message: string;
  amazonCountry: {
    base: string;
    code: string;
  };
  metadata: {
    totalResults: number;
    thisPageResults: number;
    page: number;
    query: string;
  };
  pagination: {
    nextPage: string | null;
    prevPage: string | null;
  };
  results: SearchItem[];
}

// Format price with Indian currency symbol and commas
function formatPrice(price: number): string {
  return `₹${price.toLocaleString("en-IN")}`;
}

// Format total ratings
function formatRatings(totalRatings: number): string {
  if (totalRatings === -1) {
    return "Number 1 Top-Rated";
  }
  if (totalRatings < 1000) {
    return `(${totalRatings})`;
  }
  if (totalRatings < 1000000) {
    const k = (totalRatings / 1000).toFixed(1);
    return `(${k}K)`;
  }
  const m = (totalRatings / 1000000).toFixed(1);
  return `(${m}M)`;
}

// Escape CSV field (add quotes if contains comma or quote)
function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Convert product to CSV row
function productToCsvRow(product: SearchItem): string {
  const title = escapeCsvField(product.title);
  const price = formatPrice(product.price);
  const rating = product.starRating.toString();
  const ratings = formatRatings(product.totalRatings);
  const url = product.productUrl;
  const image = product.image.small;
  const source = "Amazon";

  return `${title},${price},${rating},${ratings},${url},${image},${source}`;
}

// Fetch products from API with pagination
async function fetchProducts(query: string): Promise<SearchItem[]> {
  const allProducts: SearchItem[] = [];
  let page = 1;
  let hasMore = true;

  console.log(`Fetching products for query: "${query}"...`);

  while (hasMore && allProducts.length < TARGET_PRODUCTS_PER_QUERY) {
    try {
      const url = `${API_BASE_URL}?query=${encodeURIComponent(query)}&page=${page}`;
      console.log(`  Fetching page ${page}... (${allProducts.length} products so far)`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SearchResponse = await response.json();

      if (data.results && data.results.length > 0) {
        allProducts.push(...data.results);
        console.log(`  Got ${data.results.length} products (total: ${allProducts.length})`);

        // Check if there's a next page
        hasMore = data.pagination.nextPage !== null;
        page++;
      } else {
        hasMore = false;
      }

      // Small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error fetching page ${page} for query "${query}":`, error);
      hasMore = false;
    }
  }

  console.log(`Finished fetching ${allProducts.length} products for query: "${query}"`);
  return allProducts.slice(0, TARGET_PRODUCTS_PER_QUERY);
}

// Main function
async function main() {
  // Default queries - you can modify this list
  const queries = process.argv.slice(2);
  
  if (queries.length === 0) {
    console.log("Usage: bun index.ts <query1> <query2> ...");
    console.log("Example: bun index.ts samsung iphone oneplus");
    process.exit(1);
  }

  const allProducts: SearchItem[] = [];

  // Fetch products for each query
  for (const query of queries) {
    const products = await fetchProducts(query);
    allProducts.push(...products);
  }

  // Write to CSV (append mode to preserve existing data)
  console.log(`\nWriting ${allProducts.length} products to data.csv...`);
  const csvRows = allProducts.map(productToCsvRow);
  const csvContent = csvRows.join("\n");

  // Check if file exists and read existing content
  let existingContent = "";
  try {
    const file = Bun.file("data.csv");
    if (await file.exists()) {
      existingContent = await file.text();
      // Add newline if existing content doesn't end with one
      if (existingContent && !existingContent.endsWith("\n")) {
        existingContent += "\n";
      }
    }
  } catch (error) {
    // File doesn't exist or can't be read, start fresh
    existingContent = "";
  }

  // Append new content to existing content
  const finalContent = existingContent + csvContent;
  await Bun.write("data.csv", finalContent);
  console.log(`Successfully appended ${allProducts.length} products to data.csv`);
}

main().catch(console.error);

