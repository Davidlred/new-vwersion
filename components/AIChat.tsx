
import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, User, BookOpen, Minimize2, Settings, Trash2, Download } from 'lucide-react';
import { ChatMessage } from '../types';
import { sendChatMessage } from '../services/geminiService';

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  goal: string;
  history: ChatMessage[];
  onUpdateHistory: (messages: ChatMessage[]) => void;
}

const AIChat: React.FC<AIChatProps> = ({ isOpen, onClose, goal, history, onUpdateHistory }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize or Sync Messages from Props
  useEffect(() => {
    if (history.length > 0) {
      setMessages(history);
    } else {
       // Default Init Message if history is empty
       const initMsg: ChatMessage = { 
           id: 'init', 
           role: 'model', 
           text: `I am ready to assist with your goal: "${goal}". What requires analysis?`, 
           timestamp: Date.now() 
       };
       setMessages([initMsg]);
    }
  }, [history, goal]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isStudyMode]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    onUpdateHistory(newMessages); // Sync to parent
    
    setInput('');
    setIsTyping(true);

    // Prepare history for API
    const apiHistory = newMessages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const responseText = await sendChatMessage(apiHistory, userMsg.text, isStudyMode);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now(),
    };

    const finalMessages = [...newMessages, botMsg];
    setMessages(finalMessages);
    onUpdateHistory(finalMessages); // Sync to parent
    setIsTyping(false);
  };

  const toggleStudyMode = () => {
    setIsStudyMode(!isStudyMode);
    // Add a system note about the mode switch
    const systemMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'model',
      text: !isStudyMode 
        ? "Study Mode Engaged. Distractions minimized. Focusing on structured learning paths."
        : "Study Mode Disengaged. Returning to standard mentor interface.",
      timestamp: Date.now()
    };
    const updated = [...messages, systemMsg];
    setMessages(updated);
    onUpdateHistory(updated);
  };

  const clearHistory = () => {
    if(confirm("Are you sure you want to clear the conversation?")) {
        const resetMsg: ChatMessage = { 
           id: Date.now().toString(), 
           role: 'model', 
           text: `Conversation reset. I am ready to assist with your goal: "${goal}".`, 
           timestamp: Date.now() 
       };
       setMessages([resetMsg]);
       onUpdateHistory([resetMsg]);
       setShowSettings(false);
    }
  };

  const exportHistory = () => {
    const text = messages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bridge-chat-history-${Date.now()}.txt`;
    a.click();
    setShowSettings(false);
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`
        fixed bg-black border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 transition-all duration-500 ease-in-out
        ${isStudyMode 
          ? 'inset-4 md:inset-10 w-auto h-auto' 
          : 'bottom-24 right-6 w-80 md:w-96 h-[500px]'
        }
      `}
    >
      {/* Header */}
      <div className={`
        backdrop-blur p-4 border-b border-zinc-800 flex justify-between items-center transition-colors relative
        ${isStudyMode ? 'bg-zinc-900/95' : 'bg-zinc-900/80'}
      `}>
        <div className="flex items-center gap-2">
          <Bot size={18} className={isStudyMode ? 'text-blue-400' : 'text-white'} />
          <span className="text-sm font-bold uppercase tracking-widest text-white">
            {isStudyMode ? 'Study Module' : 'Bridge AI'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleStudyMode}
            className={`
              flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all
              ${isStudyMode 
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30' 
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
              }
            `}
            title={isStudyMode ? "Exit Study Mode" : "Enter Study Mode"}
          >
            {isStudyMode ? <Minimize2 size={12} /> : <BookOpen size={12} />}
            {isStudyMode ? 'Exit Focus' : 'Study Mode'}
          </button>
          
          <div className="relative">
              <button onClick={() => setShowSettings(!showSettings)} className="text-zinc-500 hover:text-white transition-colors p-1">
                  <Settings size={18} />
              </button>
              {showSettings && (
                  <div className="absolute right-0 top-full mt-2 w-40 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50">
                      <button onClick={exportHistory} className="w-full text-left px-4 py-3 text-xs uppercase tracking-widest text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                          <Download size={14} /> Export TXT
                      </button>
                      <button onClick={clearHistory} className="w-full text-left px-4 py-3 text-xs uppercase tracking-widest text-red-400 hover:bg-zinc-800 flex items-center gap-2">
                          <Trash2 size={14} /> Clear Chat
                      </button>
                  </div>
              )}
          </div>

          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef} 
        className={`flex-1 overflow-y-auto p-4 space-y-4 ${isStudyMode ? 'bg-zinc-950' : ''}`}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${msg.role === 'user' ? 'bg-white text-black' : (isStudyMode ? 'bg-blue-900/50 text-blue-400' : 'bg-zinc-800 text-white')}
            `}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className={`
              max-w-[85%] md:max-w-[75%] p-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed
              ${msg.role === 'user' 
                ? 'bg-zinc-800 text-white rounded-tr-none' 
                : (isStudyMode 
                    ? 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none font-mono text-xs md:text-sm shadow-lg' 
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none')
              }
            `}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
           <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isStudyMode ? 'bg-blue-900/50 text-blue-400' : 'bg-zinc-800 text-white'}`}>
                 <Bot size={14} />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl rounded-tl-none flex gap-1 items-center">
                 <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                 <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                 <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
              </div>
           </div>
        )}
      </div>

      {/* Input */}
      <div className={`p-4 border-t border-zinc-800 ${isStudyMode ? 'bg-zinc-900' : 'bg-black'}`}>
        <div className="relative max-w-4xl mx-auto w-full">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isStudyMode ? "Ask for a study plan, explanation, or quiz..." : "Discuss strategy..."}
            className={`
              w-full rounded-lg py-3 pl-4 pr-10 text-sm focus:outline-none transition-colors
              ${isStudyMode 
                ? 'bg-zinc-950 border border-zinc-700 text-white focus:border-blue-500 placeholder-zinc-600' 
                : 'bg-zinc-900 border border-zinc-800 text-white focus:border-white'
              }
            `}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-2 p-1 bg-white text-black rounded hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
