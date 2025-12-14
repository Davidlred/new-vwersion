
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Coven, PublicUser, SocialMessage } from '../types';
import { socialService } from '../services/socialService';
import { Users, Search, MessageCircle, ArrowLeft, Send, Lock, Hash, UserPlus, LogOut, CheckCircle2 } from 'lucide-react';

interface CovenHubProps {
  userEmail: string;
  userGoalKeyword: string; // To help find relevant covens
  onBack: () => void;
}

type Tab = 'FIND' | 'ALTAR' | 'WHISPERS';

const CovenHub: React.FC<CovenHubProps> = ({ userEmail, userGoalKeyword, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('FIND');
  const [myCoven, setMyCoven] = useState<Coven | undefined>(undefined);
  const [allCovens, setAllCovens] = useState<Coven[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Chat State
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // DM State
  const [dmTarget, setDmTarget] = useState<PublicUser | null>(null);
  const [availableUsers, setAvailableUsers] = useState<PublicUser[]>([]);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initial Load
  useEffect(() => {
    loadData();
    return () => stopPolling();
  }, [userEmail]);

  // Polling Effect
  useEffect(() => {
    stopPolling();
    // Only poll if we are in a chat view
    if (activeTab === 'ALTAR' || (activeTab === 'WHISPERS' && dmTarget)) {
       refreshMessages(); // Immediate fetch
       pollingRef.current = setInterval(refreshMessages, 2000);
    }
    return () => stopPolling();
  }, [activeTab, myCoven?.id, dmTarget?.email]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const loadData = () => {
    setMyCoven(socialService.getMyCoven(userEmail));
    setAllCovens(socialService.getAllCovens());
    setAvailableUsers(socialService.getAllUsers().filter(u => u.email !== userEmail));
  };

  const refreshMessages = useCallback(() => {
    if (activeTab === 'ALTAR' && myCoven) {
      setMessages(socialService.getMessages(myCoven.id, 'GROUP'));
    } else if (activeTab === 'WHISPERS' && dmTarget) {
      setMessages(socialService.getDMs(userEmail, dmTarget.email));
    }
  }, [activeTab, myCoven, dmTarget, userEmail]);

  useEffect(() => {
    // Auto scroll to bottom when messages change
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleBack = () => {
    stopPolling(); // Stop immediately
    onBack();
  };

  // Actions
  const handleCreateCoven = async () => {
    // If already in a coven, confirm switch
    if (myCoven) {
        if (!confirm(`You are currently in "${myCoven.name}". Creating a new Coven will switch your allegiance. Proceed?`)) {
            return;
        }
        await socialService.leaveCoven(myCoven.id, userEmail);
    }

    const name = prompt("Name your Coven:");
    if (!name) return;
    const focus = prompt("What is the shared goal?");
    if (!focus) return;
    
    setLoading(true);
    const coven = await socialService.createCoven(name, focus, userEmail);
    setMyCoven(coven);
    setActiveTab('ALTAR');
    setLoading(false);
  };

  const handleJoin = async (covenId: string) => {
    // If already in a coven, confirm switch
    if (myCoven) {
        if (myCoven.id === covenId) return; // Already in it
        if (!confirm(`You are currently in "${myCoven.name}". Joining this Coven will switch your allegiance. Proceed?`)) {
            return;
        }
        await socialService.leaveCoven(myCoven.id, userEmail);
    }

    setLoading(true);
    await socialService.joinCoven(covenId, userEmail);
    loadData();
    setActiveTab('ALTAR');
    setLoading(false);
  };

  const handleLeave = async () => {
    if (myCoven && confirm("Leave this Coven?")) {
      await socialService.leaveCoven(myCoven.id, userEmail);
      setMyCoven(undefined);
      setActiveTab('FIND');
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    // Optimistic update
    const content = inputText;
    setInputText('');

    if (activeTab === 'ALTAR' && myCoven) {
      await socialService.sendMessage(userEmail, content, 'GROUP', myCoven.id);
    } else if (activeTab === 'WHISPERS' && dmTarget) {
      await socialService.sendMessage(userEmail, content, 'DM', dmTarget.email);
    }
    
    refreshMessages();
  };

  // -- SUB VIEWS --

  const renderFinder = () => {
    // SORTING LOGIC:
    // 1. Relevance: If userGoalKeyword matches focus or name.
    // 2. Popularity: Number of members.
    const sortedCovens = [...allCovens].sort((a, b) => {
      // 1. Relevance Check
      if (userGoalKeyword) {
         const k = userGoalKeyword.toLowerCase();
         // Simple heuristic: 1 point if focus contains keyword, 1 point if name contains keyword
         const aScore = (a.focus.toLowerCase().includes(k) ? 2 : 0) + (a.name.toLowerCase().includes(k) ? 1 : 0);
         const bScore = (b.focus.toLowerCase().includes(k) ? 2 : 0) + (b.name.toLowerCase().includes(k) ? 1 : 0);
         
         if (aScore !== bScore) {
           return bScore - aScore; // Higher relevance first
         }
      }
      
      // 2. Member Count (Descending)
      return b.members.length - a.members.length;
    });

    const filteredCovens = sortedCovens.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.focus.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-bold uppercase tracking-widest mb-4">Find Your Tribe</h2>
          
          {/* Search Bar */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 text-zinc-500" size={16} />
            <input 
              type="text"
              placeholder="Search covens by name or goal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-white focus:outline-none transition-colors"
            />
          </div>

          <p className="text-zinc-500 text-sm mb-6">
            Join a Coven to keep your goals in check. Accountability is the bridge between intention and achievement.
          </p>

          {myCoven && (
            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex justify-between items-center mb-6">
              <div>
                <p className="text-xs text-zinc-500 uppercase">Current Allegiance</p>
                <h3 className="text-white font-bold text-lg">{myCoven.name}</h3>
              </div>
              <button 
                onClick={() => setActiveTab('ALTAR')}
                className="bg-white text-black text-xs font-bold uppercase px-4 py-2 rounded hover:bg-zinc-200"
              >
                Enter Altar
              </button>
            </div>
          )}

          <div className="grid gap-4">
            <button 
                onClick={handleCreateCoven}
                className="w-full border border-dashed border-zinc-700 p-4 rounded-xl text-zinc-400 hover:text-white hover:border-white transition-colors flex items-center justify-center gap-2 uppercase text-xs font-bold tracking-widest"
            >
                <UserPlus size={16} /> Establish New Coven
            </button>

            {filteredCovens.length === 0 ? (
                <div className="text-center p-8 text-zinc-500 text-xs uppercase tracking-widest">
                No covens found matching "{searchTerm}"
                </div>
            ) : (
                filteredCovens.map(coven => {
                // Don't show the "Join" button for the coven we are currently in, just show it as existing
                const isMyCoven = myCoven?.id === coven.id;
                // Check if this coven is "relevant"
                const isRelevant = userGoalKeyword && (coven.focus.toLowerCase().includes(userGoalKeyword.toLowerCase()) || coven.name.toLowerCase().includes(userGoalKeyword.toLowerCase()));
                
                return (
                    <div key={coven.id} className={`bg-black border p-4 rounded-xl flex justify-between items-center group transition-colors ${isMyCoven ? 'border-zinc-600 bg-zinc-900/30' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white">{coven.name}</h3>
                            {isRelevant && (
                                <span className="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-bold uppercase">Recommended</span>
                            )}
                            {isMyCoven && (
                                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-bold uppercase border border-zinc-600">Joined</span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-500">{coven.members.length} Members • Focus: {coven.focus}</p>
                    </div>
                    {!isMyCoven && (
                        <button 
                            onClick={() => handleJoin(coven.id)}
                            className="bg-zinc-900 text-white text-xs font-bold uppercase px-4 py-2 rounded border border-zinc-800 hover:bg-white hover:text-black transition-colors"
                        >
                            Join
                        </button>
                    )}
                    </div>
                );
                })
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderChat = (title: string, subtitle: string, isDm: boolean = false) => (
    <div className="flex flex-col h-[600px] bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden animate-in fade-in">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-black flex justify-between items-center">
        <div>
           <h3 className="font-bold text-white flex items-center gap-2">
             {isDm ? <Lock size={14} className="text-zinc-500" /> : <Hash size={14} className="text-zinc-500" />}
             {title}
           </h3>
           <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{subtitle}</p>
        </div>
        {!isDm && (
           <button onClick={handleLeave} title="Leave Coven" className="text-zinc-600 hover:text-red-500">
             <LogOut size={16} />
           </button>
        )}
        {isDm && (
          <button onClick={() => setDmTarget(null)} className="text-xs uppercase text-zinc-500 hover:text-white">
            Back
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-xs uppercase tracking-widest">
            Silence...
          </div>
        ) : (
          messages.map((msg, i) => {
             const isMe = msg.senderEmail === userEmail;
             const showHeader = i === 0 || messages[i-1].senderEmail !== msg.senderEmail;
             return (
               <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                 {showHeader && (
                   <span className="text-[10px] text-zinc-500 mb-1 px-1">
                     {isMe ? 'You' : msg.senderName}
                   </span>
                 )}
                 <div className={`max-w-[80%] p-3 rounded-xl text-sm ${isMe ? 'bg-white text-black rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none'}`}>
                   {msg.content}
                 </div>
               </div>
             );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-black border-t border-zinc-800 flex gap-2">
        <input 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Send a message..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors"
        />
        <button 
          onClick={handleSendMessage}
          disabled={!inputText.trim()}
          className="bg-white text-black p-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );

  const renderWhispers = () => (
    <div className="h-[600px] flex gap-4 animate-in fade-in">
       {/* Sidebar List */}
       <div className={`w-full ${dmTarget ? 'hidden md:block md:w-1/3' : ''} bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col`}>
          <div className="p-4 border-b border-zinc-800 bg-black">
            <h3 className="font-bold text-white uppercase tracking-widest text-xs">Members Directory</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
             {availableUsers.map(u => (
               <button 
                 key={u.email}
                 onClick={() => setDmTarget(u)}
                 className={`w-full p-3 rounded-xl text-left transition-colors flex items-center gap-3 ${dmTarget?.email === u.email ? 'bg-white text-black' : 'bg-black text-zinc-400 hover:bg-zinc-800'}`}
               >
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${dmTarget?.email === u.email ? 'bg-black text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                   {u.displayName.charAt(0).toUpperCase()}
                 </div>
                 <div>
                    <span className="block font-bold text-sm">{u.displayName}</span>
                    <span className="block text-[10px] opacity-70">{u.goalKeywords.join(', ')}</span>
                 </div>
               </button>
             ))}
          </div>
       </div>

       {/* Chat Area */}
       <div className={`w-full ${!dmTarget ? 'hidden md:flex md:w-2/3 items-center justify-center border border-zinc-800 rounded-2xl bg-zinc-900/50' : ''}`}>
          {dmTarget ? (
            <div className="w-full h-full">
               {renderChat(dmTarget.displayName, "Private Channel", true)}
            </div>
          ) : (
            <div className="text-center text-zinc-600">
               <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
               <p className="text-xs uppercase tracking-widest">Select a member to whisper</p>
            </div>
          )}
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in">
      
      {/* Header */}
      <header className="flex justify-between items-center border-b border-zinc-800 pb-6">
        <button onClick={handleBack} className="text-xs uppercase tracking-widest text-zinc-500 hover:text-white flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Command
        </button>
        <div className="flex items-center gap-2">
           <Users size={20} />
           <h1 className="text-2xl font-black uppercase tracking-tighter">The Coven</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex justify-center mb-4">
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button 
            onClick={() => setActiveTab('FIND')}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'FIND' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
          >
            <Search size={14} /> Discovery
          </button>
          <button 
            onClick={() => {
              if(!myCoven) { alert("Join a Coven first."); return; }
              setActiveTab('ALTAR');
            }}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'ALTAR' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'} ${!myCoven ? 'opacity-50' : ''}`}
          >
            <Hash size={14} /> The Altar
          </button>
          <button 
            onClick={() => setActiveTab('WHISPERS')}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'WHISPERS' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
          >
            <Lock size={14} /> Whispers
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
         {activeTab === 'FIND' && renderFinder()}
         {activeTab === 'ALTAR' && myCoven && renderChat(myCoven.name, myCoven.focus)}
         {activeTab === 'WHISPERS' && renderWhispers()}
      </div>

    </div>
  );
};

export default CovenHub;
