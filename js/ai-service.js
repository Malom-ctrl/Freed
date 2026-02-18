window.Freed = window.Freed || {};

window.Freed.AI = {
  generateParsingRule: async function (htmlString, url) {
    const apiKey = localStorage.getItem("freed_api_key");
    if (!apiKey) {
      throw new Error(
        "Gemini API Key is missing. Please set it in Settings to parse this feed.",
      );
    }

    try {
      // Dynamic import to support module in standard script environment
      const { GoogleGenAI, Type } = await import("@google/genai");

      const ai = new GoogleGenAI({ apiKey: apiKey });

      // Clean HTML to save tokens
      const cleanHtml = htmlString
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
        .replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gim, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .substring(0, 40000); // Truncate to reasonable length

      const prompt = `Analyze the provided HTML from ${url}. I need to extract a list of articles/posts.
            Identify the CSS selectors for the following elements:
            1. Container: The element wrapping a single article card/item.
            2. Title: The title text (usually h1, h2, h3).
            3. Link: The anchor tag pointing to the full article.
            4. Date: The publication date (time tag or span).
            5. Snippet: A short description or excerpt.
            6. Image: The thumbnail image (img tag).

            Return a JSON object containing the CSS selectors.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: cleanHtml,
        config: {
          systemInstruction: prompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              container: {
                type: Type.STRING,
                description: "CSS selector for the article item container",
              },
              title: {
                type: Type.STRING,
                description: "CSS selector for the title inside the container",
              },
              link: {
                type: Type.STRING,
                description:
                  "CSS selector for the link anchor inside the container",
              },
              date: {
                type: Type.STRING,
                description:
                  "CSS selector for the date element inside the container",
              },
              snippet: {
                type: Type.STRING,
                description:
                  "CSS selector for the description/snippet inside the container",
              },
              image: {
                type: Type.STRING,
                description:
                  "CSS selector for the thumbnail image inside the container",
              },
            },
            required: ["container", "title", "link"],
          },
        },
      });

      return JSON.parse(response.text);
    } catch (e) {
      console.error("Parsing Error:", e);
      // Handle invalid key errors explicitely
      if (
        e.message &&
        (e.message.toLowerCase().includes("api key") ||
          e.message.includes("403"))
      ) {
        throw new Error("Invalid Gemini API Key. Please check Settings.");
      }
      return null;
    }
  },
};
