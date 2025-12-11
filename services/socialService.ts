
import { Coven, PublicUser, SocialMessage } from "../types";

const COVENS_KEY = 'bridge_covens_db';
const MESSAGES_KEY = 'bridge_messages_db';
const USERS_KEY = 'bridge_users_db'; // Same as authService

// Helper to simulate "Server" time
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const socialService = {

  // --- SEEDING (So the user isn't alone) ---
  seedFakeUsers: () => {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (users.length < 2) {
      const fakeUsers = [
        { email: 'atlas@bridge.com', password: '123', goalKeywords: ['fitness', 'marathon', 'running'], displayName: 'Atlas' },
        { email: 'neo@bridge.com', password: '123', goalKeywords: ['coding', 'software', 'startup'], displayName: 'Neo' },
        { email: 'trinity@bridge.com', password: '123', goalKeywords: ['business', 'finance', 'wealth'], displayName: 'Trinity' },
      ];
      // Merge fakes into DB
      const updated = [...users, ...fakeUsers.filter(f => !users.find((u: any) => u.email === f.email))];
      localStorage.setItem(USERS_KEY, JSON.stringify(updated));
      
      // Seed a Coven
      const covens = JSON.parse(localStorage.getItem(COVENS_KEY) || '[]');
      if (covens.length === 0) {
        covens.push({
          id: 'coven_alpha',
          name: 'The Architects',
          focus: 'Building the Future',
          members: ['neo@bridge.com', 'trinity@bridge.com'],
          createdBy: 'neo@bridge.com'
        });
        localStorage.setItem(COVENS_KEY, JSON.stringify(covens));
      }
    }
  },

  // --- COVENS ---

  getAllCovens: (): Coven[] => {
    return JSON.parse(localStorage.getItem(COVENS_KEY) || '[]');
  },

  createCoven: async (name: string, focus: string, creatorEmail: string): Promise<Coven> => {
    await delay(500);
    const covens = socialService.getAllCovens();
    const newCoven: Coven = {
      id: `coven_${Date.now()}`,
      name,
      focus,
      members: [creatorEmail],
      createdBy: creatorEmail
    };
    covens.push(newCoven);
    localStorage.setItem(COVENS_KEY, JSON.stringify(covens));
    return newCoven;
  },

  joinCoven: async (covenId: string, userEmail: string): Promise<void> => {
    await delay(300);
    const covens = socialService.getAllCovens();
    const coven = covens.find(c => c.id === covenId);
    if (coven && !coven.members.includes(userEmail)) {
      coven.members.push(userEmail);
      localStorage.setItem(COVENS_KEY, JSON.stringify(covens));
    }
  },

  leaveCoven: async (covenId: string, userEmail: string): Promise<void> => {
    await delay(300);
    const covens = socialService.getAllCovens();
    const coven = covens.find(c => c.id === covenId);
    if (coven) {
      coven.members = coven.members.filter(m => m !== userEmail);
      localStorage.setItem(COVENS_KEY, JSON.stringify(covens));
    }
  },

  getMyCoven: (userEmail: string): Coven | undefined => {
    const covens = socialService.getAllCovens();
    return covens.find(c => c.members.includes(userEmail));
  },

  // --- MESSAGING ---

  getMessages: (targetId: string, type: 'GROUP' | 'DM'): SocialMessage[] => {
    const allMsgs: SocialMessage[] = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]');
    let filtered: SocialMessage[] = [];
    
    if (type === 'GROUP') {
      filtered = allMsgs.filter(m => m.type === 'GROUP' && m.targetId === targetId);
    } 
    // Optimization: Return only last 50 messages to prevent lag
    return filtered.slice(-50);
  },

  // Helper for DMs specifically
  getDMs: (user1: string, user2: string): SocialMessage[] => {
    const allMsgs: SocialMessage[] = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]');
    const filtered = allMsgs.filter(m => 
      m.type === 'DM' && 
      ((m.senderEmail === user1 && m.targetId === user2) || 
       (m.senderEmail === user2 && m.targetId === user1))
    );
    // Optimization: Return only last 50 messages
    return filtered.slice(-50);
  },

  sendMessage: async (senderEmail: string, content: string, type: 'GROUP' | 'DM', targetId: string): Promise<SocialMessage> => {
    // delay removed for snappier feel
    const allMsgs: SocialMessage[] = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]');
    const newMsg: SocialMessage = {
      id: Date.now().toString(),
      senderEmail,
      senderName: senderEmail.split('@')[0], // Simple display name
      content,
      timestamp: Date.now(),
      type,
      targetId
    };
    allMsgs.push(newMsg);
    // Optional: Prune old messages if DB gets too big (e.g., > 1000)
    if (allMsgs.length > 1000) {
      allMsgs.splice(0, allMsgs.length - 1000);
    }
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMsgs));
    return newMsg;
  },

  // --- USERS ---

  getAllUsers: (): PublicUser[] => {
    const rawUsers = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    // sanitize
    return rawUsers.map((u: any) => ({
      email: u.email,
      displayName: u.displayName || u.email.split('@')[0],
      goalKeywords: u.goalKeywords || []
    }));
  }
};
