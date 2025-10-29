import { createServer } from "http";
import multer from "multer";
import { promises as fs } from "fs";
import mammoth from "mammoth";
import { storage } from "./storage.js";
import { sendContactEmail, sendWelcomeEmail } from "./emailService.js";
import { insertContactSchema, insertNewsletterSchema } from "../shared/schema.js";
import * as pdfParseModule from "pdf-parse";
// import { encoding_for_model } from '@dqbd/tiktoken';
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});
export async function registerRoutes(app) {
    // ==========================================
    // AI TOOLS API ENDPOINTS
    // ==========================================
    // 1. TOKENIZATION TOOL
    app.post('/api/tools/tokenize', async (req, res) => {
        try {
            const { text } = req.body;
            if (!text || typeof text !== 'string') {
                return res.status(400).json({ error: 'Text is required and must be a string' });
            }
            // Initialize encoder
            const encoder = new Tiktoken(o200k_base);
            const tokenIds = encoder.encode(text);
            const tokens = tokenIds.map((id, i) => ({
                index: i + 1,
                token: encoder.decode([id]),
                id
            }));
            const result = {
                original_text: text,
                model: 'gpt-4o',
                token_count: tokenIds.length,
                tokens,
                statistics: {
                    avg_token_length: tokens.reduce((sum, t) => sum + t.token.length, 0) / tokens.length,
                    unique_tokens: [...new Set(tokens.map(t => t.token))].length,
                    character_count: text.length,
                    word_count: text.trim().split(/\s+/).filter(Boolean).length
                }
            };
            res.json({ success: true, result });
        }
        catch (error) {
            console.error('Tokenization error:', error);
            res.status(500).json({ error: error.message || 'Failed to tokenize text' });
        }
    });
    // 2. CHUNKING TOOL
    app.post("/api/tools/chunk", async (req, res) => {
        try {
            const { text, chunk_size, overlap = 0 } = req.body;
            if (!text || !chunk_size) {
                return res.status(400).json({ error: "Text and chunk_size are required" });
            }
            const chunkSizeNum = parseInt(chunk_size);
            const overlapNum = parseInt(overlap) || 0;
            if (chunkSizeNum <= 0) {
                return res.status(400).json({ error: "Chunk size must be positive" });
            }
            const encoder = new Tiktoken(o200k_base);
            const tokenIds = encoder.encode(text);
            const chunks = [];
            let start = 0;
            while (start < tokenIds.length) {
                const end = Math.min(start + chunkSizeNum, tokenIds.length);
                const chunkTokenIds = tokenIds.slice(start, end);
                const chunkText = encoder.decode(chunkTokenIds);
                chunks.push({
                    index: chunks.length + 1,
                    content: chunkText,
                    length: chunkText.length,
                    token_count: chunkTokenIds.length,
                    start_token_index: start,
                    end_token_index: end - 1,
                    word_count: chunkText.trim().split(/\s+/).filter(Boolean).length
                });
                start = Math.max(start + chunkSizeNum - overlapNum, start + 1);
            }
            const result = {
                original_text: text,
                chunk_size: chunkSizeNum,
                overlap: overlapNum,
                total_chunks: chunks.length,
                chunks,
                statistics: {
                    total_characters: text.length,
                    total_tokens: tokenIds.length,
                    avg_chunk_length: chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
                    avg_tokens_per_chunk: chunks.reduce((sum, c) => sum + c.token_count, 0) / chunks.length,
                    coverage_percentage: (chunks.map(c => c.content).join('').length / text.length) * 100
                }
            };
            res.json({ success: true, result });
        }
        catch (error) {
            console.error('Chunking error:', error);
            res.status(500).json({ error: "Failed to chunk text" });
        }
    });
    // 3. AI ASSISTANT TOOL
    app.post("/api/tools/chat", async (req, res) => {
        try {
            const { groq_api_key, message, model = "llama-3.1-8b-instant" } = req.body;
            if (!groq_api_key || !message) {
                return res.status(400).json({ error: "Groq API key and message are required" });
            }
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${groq_api_key}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful AI assistant created by GenOrcasX. Provide clear, accurate, and helpful responses."
                        },
                        {
                            role: "user",
                            content: message
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1000
                })
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Groq API error: ${error}`);
            }
            const data = await response.json();
            const assistantMessage = data.choices[0]?.message?.content;
            const result = {
                model_used: model,
                user_message: message,
                assistant_response: assistantMessage,
                tokens_used: data.usage?.total_tokens || 0,
                timestamp: new Date().toISOString(),
                metadata: {
                    finish_reason: data.choices[0]?.finish_reason,
                    prompt_tokens: data.usage?.prompt_tokens,
                    completion_tokens: data.usage?.completion_tokens
                }
            };
            res.json({ success: true, result });
        }
        catch (error) {
            console.error('Chat error:', error);
            res.status(500).json({ error: error.message || "Failed to process chat request" });
        }
    });
    // 4. EMBEDDING TOOL
    app.post("/api/tools/embed", async (req, res) => {
        try {
            const { text, model, dimensions, apikey } = req.body;
            if (!text || !model?.trim()) {
                return res.status(400).json({ error: "Text and model are required" });
            }
            // Use real embedding if API key is provided
            if (apikey?.trim()) {
                const selectedModel = model;
                const response = await fetch("https://api.openai.com/v1/embeddings", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apikey}`,
                    },
                    body: JSON.stringify({
                        input: text,
                        model: selectedModel,
                        ...(dimensions ? { dimensions: parseInt(dimensions) } : {}),
                    }),
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    return res.status(response.status).json({ error: `OpenAI error: ${errorText}` });
                }
                const result = await response.json();
                const embedding = result.data?.[0]?.embedding;
                return res.json({
                    success: true,
                    result: {
                        text,
                        model_used: selectedModel,
                        dimensions: embedding.length,
                        embedding,
                        statistics: {
                            text_length: text.length,
                            word_count: text.split(/\s+/).length,
                            vector_magnitude: Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)),
                            min_value: Math.min(...embedding),
                            max_value: Math.max(...embedding)
                        },
                        note: "This is a real embedding from OpenAI."
                    }
                });
            }
            // Fallback: mock embedding
            const mockEmbedding = Array.from({ length: dimensions || 1536 }, () => Math.random() * 2 - 1);
            const result = {
                text,
                model_used: model,
                dimensions: mockEmbedding.length,
                embedding: mockEmbedding,
                statistics: {
                    text_length: text.length,
                    word_count: text.split(/\s+/).length,
                    vector_magnitude: Math.sqrt(mockEmbedding.reduce((sum, val) => sum + val * val, 0)),
                    min_value: Math.min(...mockEmbedding),
                    max_value: Math.max(...mockEmbedding)
                },
                note: "This is a demo embedding. Provide OpenAI API key for real embeddings."
            };
            res.json({ success: true, result });
        }
        catch (error) {
            console.error("Embedding error:", error);
            res.status(500).json({ error: "Failed to generate embeddings" });
        }
    });
    // 5. EVALUATION TOOL
    app.post("/api/tools/evaluate", async (req, res) => {
        try {
            const { model_responses, ground_truth, metrics = "basic" } = req.body;
            if (!model_responses) {
                return res.status(400).json({ error: "Model responses are required" });
            }
            const responses = model_responses.split('\n').filter(r => r.trim());
            const truths = ground_truth ? ground_truth.split('\n').filter(r => r.trim()) : [];
            // Basic text evaluation metrics
            const evaluation = {
                response_count: responses.length,
                avg_response_length: responses.reduce((sum, r) => sum + r.length, 0) / responses.length,
                total_words: responses.reduce((sum, r) => sum + r.split(/\s+/).length, 0),
                unique_words: [...new Set(responses.join(' ').split(/\s+/))].length,
                readability_scores: responses.map((response, index) => {
                    const sentences = response.split(/[.!?]+/).filter(s => s.trim()).length;
                    const words = response.split(/\s+/).length;
                    const avgWordsPerSentence = words / Math.max(sentences, 1);
                    return {
                        response_index: index + 1,
                        word_count: words,
                        sentence_count: sentences,
                        avg_words_per_sentence: avgWordsPerSentence,
                        readability_grade: Math.max(1, Math.min(12, avgWordsPerSentence - 5)) // Simplified formula
                    };
                }),
                similarity_analysis: truths.length > 0 ? responses.map((response, index) => {
                    const truth = truths[index] || truths[0];
                    const responseWords = new Set(response.toLowerCase().split(/\s+/));
                    const truthWords = new Set(truth.toLowerCase().split(/\s+/));
                    const intersection = new Set([...responseWords].filter(x => truthWords.has(x)));
                    const union = new Set([...responseWords, ...truthWords]);
                    return {
                        response_index: index + 1,
                        jaccard_similarity: intersection.size / union.size,
                        common_words: intersection.size,
                        response_unique_words: responseWords.size - intersection.size,
                        truth_unique_words: truthWords.size - intersection.size
                    };
                }) : null,
                overall_score: {
                    consistency: responses.length > 1 ?
                        1 - (new Set(responses).size / responses.length) : 1, // How similar responses are
                    completeness: Math.min(1, responses.join('').length / 1000), // Arbitrary completeness metric
                    relevance: truths.length > 0 ?
                        responses.reduce((sum, resp, idx) => {
                            const truth = truths[idx] || truths[0];
                            return sum + (resp.length > 0 && truth.length > 0 ? 0.8 : 0.3);
                        }, 0) / responses.length : 0.7
                }
            };
            res.json({ success: true, result: evaluation });
        }
        catch (error) {
            console.error('Evaluation error:', error);
            res.status(500).json({ error: "Failed to evaluate responses" });
        }
    });
    // 6. RAG TOOL
    app.post("/api/tools/rag", upload.single('file'), async (req, res) => {
        try {
            const { groq_api_key, openai_embed_key, query } = req.body;
            const file = req.file;
            if (!groq_api_key || !query) {
                return res.status(400).json({ error: "Groq API key and query are required" });
            }
            let documentText = "";
            if (file) {
                // Extract text from uploaded file
                try {
                    if (file.mimetype === 'application/pdf') {
                        // Dynamically import pdf-parse to avoid initialization issues
                        const pdfParse = pdfParseModule.default || pdfParseModule;
                        const dataBuffer = req.file?.buffer || req.body?.fileBuffer;
                        const pdfData = await pdfParse(dataBuffer);
                        documentText = pdfData.text;
                    }
                    else if (file.mimetype.includes('word')) {
                        const result = await mammoth.extractRawText({ path: file.path });
                        documentText = result.value;
                    }
                    else {
                        // Assume text file
                        documentText = await fs.readFile(file.path, 'utf-8');
                    }
                    // Clean up uploaded file
                    await fs.unlink(file.path);
                }
                catch (fileError) {
                    console.error('File processing error:', fileError);
                    documentText = "Sample document content for demonstration. Upload a real document for actual processing.";
                }
            }
            else {
                documentText = "No document provided. This is a sample RAG response using the query alone.";
            }
            // Simple chunking for RAG
            const chunks = [];
            const chunkSize = 1000;
            for (let i = 0; i < documentText.length; i += chunkSize) {
                chunks.push(documentText.slice(i, i + chunkSize));
            }
            // For demo, select first few chunks as "relevant"
            const relevantChunks = chunks.slice(0, 3);
            const context = relevantChunks.join('\n\n');
            // Generate response using Groq
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${groq_api_key}`
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant. Answer the user's question based on the provided context. If the context doesn't contain relevant information, say so clearly."
                        },
                        {
                            role: "user",
                            content: `Context:\n${context}\n\nQuestion: ${query}\n\nPlease answer based on the provided context.`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 800
                })
            });
            if (!response.ok) {
                throw new Error(`Groq API error: ${await response.text()}`);
            }
            const data = await response.json();
            const answer = data.choices[0]?.message?.content;
            const result = {
                query,
                document_info: {
                    filename: file?.originalname || "No file",
                    size: file?.size || 0,
                    type: file?.mimetype || "unknown",
                    text_length: documentText.length,
                    chunks_created: chunks.length
                },
                relevant_chunks: relevantChunks.map((chunk, index) => ({
                    index: index + 1,
                    content: chunk.substring(0, 200) + (chunk.length > 200 ? "..." : ""),
                    full_content: chunk
                })),
                answer,
                metadata: {
                    model_used: "llama-3.1-8b-instant",
                    tokens_used: data.usage?.total_tokens || 0,
                    retrieval_method: "simple_chunking",
                    context_length: context.length,
                    timestamp: new Date().toISOString()
                }
            };
            res.json({ success: true, result });
        }
        catch (error) {
            console.error('RAG error:', error);
            res.status(500).json({ error: error.message || "Failed to process RAG request" });
        }
    });
    // ==========================================
    // CONTACT FORM & NEWSLETTER ENDPOINTS
    // ==========================================
    // Contact form submission
    app.post("/api/contact", async (req, res) => {
        try {
            // Validate input data
            const validatedData = insertContactSchema.parse(req.body);
            // Store in database
            const contact = await storage.insertContact(validatedData);
            // Send email notification
            const emailResult = await sendContactEmail({
                name: validatedData.name,
                email: validatedData.email,
                company: validatedData.company || undefined,
                message: validatedData.message,
            });
            let message = "Thank you for your message! We'll get back to you soon.";
            if (!emailResult.success) {
                console.error('Failed to send contact email:', emailResult.error);
                // Still return success to user since data was stored
                message = "Thank you for your message! We've received it and will get back to you soon. (Note: Email notification may be delayed)";
            }
            res.json({
                success: true,
                message: message,
                contact: contact
            });
        }
        catch (error) {
            console.error('Contact form error:', error);
            if (error.name === 'ZodError') {
                return res.status(400).json({
                    error: "Please check your input data",
                    details: error.errors
                });
            }
            res.status(500).json({ error: "Failed to submit contact form" });
        }
    });
    // Newsletter subscription
    app.post("/api/newsletter", async (req, res) => {
        try {
            // Validate input data
            const validatedData = insertNewsletterSchema.parse(req.body);
            // Check if email already exists
            const existingSubscription = await storage.getNewsletterByEmail(validatedData.email);
            if (existingSubscription) {
                return res.json({
                    success: true,
                    message: "You're already subscribed to our newsletter!"
                });
            }
            // Store in database
            const subscription = await storage.insertNewsletter(validatedData);
            // Send welcome email
            const emailResult = await sendWelcomeEmail(validatedData.email);
            let message = "Thank you for subscribing! Check your email for confirmation.";
            if (!emailResult.success) {
                console.error('Failed to send welcome email:', emailResult.error);
                // Still return success to user since subscription was stored
                message = "Thank you for subscribing! You're now on our newsletter list. (Welcome email may be delayed)";
            }
            res.json({
                success: true,
                message: message,
                subscription: subscription
            });
        }
        catch (error) {
            console.error('Newsletter subscription error:', error);
            if (error.name === 'ZodError') {
                return res.status(400).json({
                    error: "Please provide a valid email address",
                    details: error.errors
                });
            }
            res.status(500).json({ error: "Failed to subscribe to newsletter" });
        }
    });
    const httpServer = createServer(app);
    return httpServer;
}
