document.addEventListener("DOMContentLoaded", () => {
    // Detect if we're on the chatbot page (elements exist)
    const chatBox = document.getElementById("chat-box");
    const userInput = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");

    // If not on chatbot page, skip chat-specific logic
    if (!chatBox || !userInput || !sendBtn) {
        return;
    }

    // Chat persistence strategy:
    // - Use sessionStorage so history persists across navigation within the same tab
    // - Migrate any existing localStorage history one time
    // - Store full rendered answer text (after augmenting with lookup / remedies) so re-render is faithful

    const GLOBAL_KEY = 'siddha_chat_history_global';
    let chatHistory = [];

    const loadHistory = () => {
        try {
            const raw = localStorage.getItem(GLOBAL_KEY);
            if (raw) {
                chatHistory = JSON.parse(raw);
                chatHistory.forEach(pair => {
                    appendMessage(pair[0], 'user-message', true);
                    appendMessage(pair[1], 'bot-message', false);
                });
                console.log('[CHAT] Restored', chatHistory.length, 'pairs');
            } else {
                console.log('[CHAT] No existing history');
            }
        } catch(e) { console.warn('[CHAT] Failed to restore history', e); }
    };

    const saveHistory = () => {
        try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(chatHistory)); }
        catch(e) { console.warn('[CHAT] Failed to persist history', e); }
    };

    loadHistory();

    const sendMessage = async () => {
        const question = userInput.value.trim();
        if (!question) return;

        console.log("Sending question:", question);
        appendMessage(question, "user-message", true);
        userInput.value = "";
        const thinkingIndicator = appendMessage("Thinking...", "bot-message thinking", false);

        try {
            console.log("Making API request to http://127.0.0.1:8000/chat");
            const response = await fetch("http://127.0.0.1:8000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: question,
                    chat_history: chatHistory,
                }),
            });

            console.log("Response status:", response.status);
            console.log("Response ok:", response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Response error:", errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log("Received data:", data);
            
            if (!data.answer) {
                throw new Error("No answer received from server");
            }
            
            chatBox.removeChild(thinkingIndicator);
            
            // Check if marked is available
            let finalAnswer = data.answer;
            if (data.lookup) {
                const header = `Direct ${data.lookup.category} lookup for: ${data.lookup.query} (matches: ${data.lookup.count})`;
                finalAnswer = header + "\n\n" + finalAnswer;
            }

            // Append structured remedies section if present
            const collectRemedySection = (arr, title) => {
                if (!arr || arr.length === 0) return '';
                const lines = [`\n\n### ${title}\n`];
                arr.forEach(r => {
                    lines.push(`**${r.name}**\n- Preparation: ${r.preparation}\n- Usage: ${r.usage}\n- More: <a href="${r.url}" target="_blank">Open</a>\n`);
                });
                return lines.join('\n');
            };
            finalAnswer += collectRemedySection(data.referenced_remedies, 'Remedy Details');
            finalAnswer += collectRemedySection(data.suggested_remedies, 'Suggested Remedies');

            let renderedAnswer = finalAnswer;
            if (typeof marked !== 'undefined' && marked.parse) {
                console.log("Using marked.parse for markdown");
                renderedAnswer = marked.parse(finalAnswer);
                appendMessage(renderedAnswer, "bot-message", false);
            } else {
                console.log("Marked not available, using plain text");
                appendMessage(finalAnswer, "bot-message", false);
            }

            // Store user question and the FULL finalAnswer (not just raw data.answer) for faithful re-render
            chatHistory.push([question, finalAnswer]);
            saveHistory();
            console.log("Updated chat history (session):", chatHistory);

        } catch (error) {
            console.error("Complete error object:", error);
            console.error("Error message:", error.message);
            chatBox.removeChild(thinkingIndicator);
            appendMessage("Sorry, something went wrong. Please try again. Error: " + error.message, "bot-message error", false);
        }
    };

    const appendMessage = (text, className, isUser) => {
        console.log("Appending message:", { text: text.substring(0, 100) + "...", className, isUser });
        
        const messageDiv = document.createElement("div");
        messageDiv.className = `chat-message ${className}`;
        
        let iconHtml = isUser ? '<i class="fas fa-user user-icon"></i>' : '<i class="fas fa-leaf bot-icon"></i>';
        if (className.includes('thinking')) iconHtml = '';

        // For user messages, wrap text in a <p> tag. For bot messages, insert the parsed HTML.
        const contentHtml = isUser ? `<p>${text}</p>` : text;

        messageDiv.innerHTML = `${iconHtml}<div class="message-content">${contentHtml}</div>`;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        
        console.log("Message appended successfully");
        return messageDiv;
    };

    sendBtn.addEventListener("click", sendMessage);
    userInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") sendMessage();
    });

    // Optional clear history button (if element exists)
    const clearBtn = document.getElementById('clear-history');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            localStorage.removeItem(GLOBAL_KEY);
            chatHistory = [];
            chatBox.innerHTML = '';
            appendMessage('History cleared. Start a new conversation.', 'bot-message', false);
        });
    }
});