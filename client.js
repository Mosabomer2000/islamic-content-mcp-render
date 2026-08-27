import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVER_PATH = path.join(__dirname, "bin.js");
export class IslamicContentMCPClient {
    serverPath;
    apiKey;
    client = null;
    transport = null;
    constructor(options = {}) {
        this.serverPath = options.serverPath || DEFAULT_SERVER_PATH;
        this.apiKey = options.apiKey;
    }
    /**
     * Connects to the local Islamic Content MCP Server via stdio transport
     */
    async connect() {
        this.transport = new StdioClientTransport({
            command: "node",
            args: [this.serverPath]
        });
        this.client = new Client({
            name: "islamic-content-mcp-client",
            version: "1.0.0"
        }, {
            capabilities: {}
        });
        await this.client.connect(this.transport);
    }
    /**
     * Disconnects the MCP client and closes the transport
     */
    async disconnect() {
        if (this.transport) {
            await this.transport.close();
        }
    }
    /**
     * Exposes raw access to list all MCP tools
     */
    async getTools() {
        if (!this.client)
            throw new Error("Client not connected. Call connect() first.");
        const response = await this.client.listTools();
        return response.tools || [];
    }
    /**
     * Exposes raw access to call any MCP tool
     */
    async callTool(name, args = {}) {
        if (!this.client)
            throw new Error("Client not connected. Call connect() first.");
        const response = await this.client.callTool({
            name,
            arguments: args
        });
        const content = response.content;
        if (response.isError) {
            const errMsg = content?.[0]?.text || "Unknown error";
            throw new Error(`MCP Server Error: ${errMsg}`);
        }
        return content;
    }
    /**
     * High-level helper to gather content from Quran/Hadith tools
     * and build a structured context text for an LLM prompt.
     */
    async getContext({ topic, sources = ["quran", "hadith"], language = "en" }) {
        let contextText = `=== ISLAMIC CONTENT CONTEXT FOR TOPIC: "${topic}" ===\n\n`;
        if (sources.includes("hadith")) {
            contextText += "--- Hadith Sources ---\n";
            try {
                // 1. Fetch categories
                const categoriesResult = await this.callTool("hadeethenc_categories", { languageCode: language });
                const categoriesText = categoriesResult?.[0]?.text;
                const categories = categoriesText ? JSON.parse(categoriesText) : [];
                // 2. Find a category matching the topic (simple keyword search)
                const matchedCategory = categories.find((cat) => cat.title.toLowerCase().includes(topic.toLowerCase()));
                if (matchedCategory) {
                    // 3. Fetch Hadiths under this category
                    const hadithListResult = await this.callTool("hadeethenc_hadiths_list", {
                        language: language,
                        categoryId: parseInt(matchedCategory.id),
                        perPage: 3
                    });
                    const listText = hadithListResult?.[0]?.text;
                    const listObj = listText ? JSON.parse(listText) : null;
                    const hadiths = listObj && listObj.data ? listObj.data : [];
                    for (const item of hadiths) {
                        // 4. Fetch full details of each Hadith
                        const detailsResult = await this.callTool("hadeethenc_hadith_details", {
                            id: parseInt(item.id),
                            language: language
                        });
                        const detailsText = detailsResult?.[0]?.text;
                        const details = detailsText ? JSON.parse(detailsText) : null;
                        if (details) {
                            contextText += `[Hadith ID: ${details.id}]\n`;
                            contextText += `Title: ${details.title}\n`;
                            contextText += `Arabic Text: ${details.hadeeth}\n`;
                            contextText += `Translation: ${details.translation}\n`;
                            contextText += `Explanation: ${details.explanation}\n\n`;
                        }
                    }
                }
                else {
                    contextText += `No specific Hadith category found matching "${topic}".\n\n`;
                }
            }
            catch (err) {
                contextText += `Error fetching Hadith context: ${err.message}\n\n`;
            }
        }
        if (sources.includes("quran")) {
            contextText += "--- Quran Sources ---\n";
            try {
                const translationKey = language === "ar" ? "arabic_moyassar" : "english_saheeh";
                const quranResult = await this.callTool("quranenc_translation_sura", {
                    translationKey: translationKey,
                    suraNumber: 1
                });
                const quranText = quranResult?.[0]?.text;
                const quranObj = quranText ? JSON.parse(quranText) : null;
                const quranData = quranObj && quranObj.result ? quranObj.result : [];
                contextText += `[Quran Surah 1 (Al-Fatiha)]\n`;
                const sampleAyas = quranData.slice(0, 7);
                for (const aya of sampleAyas) {
                    contextText += `Ayah ${aya.aya}: ${aya.translation} (${aya.arabic_text})\n`;
                }
                contextText += "\n";
            }
            catch (err) {
                contextText += `Error fetching Quran context: ${err.message}\n\n`;
            }
        }
        return contextText;
    }
}
