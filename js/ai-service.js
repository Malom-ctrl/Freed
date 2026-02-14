

window.Freed = window.Freed || {};

window.Freed.AI = {
    generateParsingRule: async function(htmlString, url) {
        try {
            // Dynamic import to support module in standard script environment
            const { GoogleGenAI, Type } = await import('@google/genai');
            
            // Get API Key from LocalStorage
            const apiKey = localStorage.getItem('freed_api_key');
            if (!apiKey) {
                console.warn('Gemini API Key is missing. Please set it in Settings.');
                return null;
            }

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
                model: 'gemini-3-flash-preview',
                contents: cleanHtml,
                config: {
                    systemInstruction: prompt,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            container: { type: Type.STRING, description: "CSS selector for the article item container" },
                            title: { type: Type.STRING, description: "CSS selector for the title inside the container" },
                            link: { type: Type.STRING, description: "CSS selector for the link anchor inside the container" },
                            date: { type: Type.STRING, description: "CSS selector for the date element inside the container" },
                            snippet: { type: Type.STRING, description: "CSS selector for the description/snippet inside the container" },
                            image: { type: Type.STRING, description: "CSS selector for the thumbnail image inside the container" }
                        },
                        required: ["container", "title", "link"]
                    }
                }
            });

            return JSON.parse(response.text);
        } catch (e) {
            console.error("Parsing Error:", e);
            return null;
        }
    },

    translateText: async function(text, targetLanguage) {
        try {
            const { GoogleGenAI } = await import('@google/genai');
            const apiKey = localStorage.getItem('freed_api_key');
            if (!apiKey) throw new Error("Missing API Key");

            const ai = new GoogleGenAI({ apiKey: apiKey });
            
            // Using flash for speed
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Translate the following text to ${targetLanguage}. Return only the translated text, no markdown, no explanations:\n\n${text}`
            });

            return response.text;
        } catch (e) {
            console.error("Translation Error:", e);
            return null;
        }
    }
};