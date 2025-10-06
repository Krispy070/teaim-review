import { type Profile, type InsertProfile } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<Profile | undefined>;
  getUserByUsername(username: string): Promise<Profile | undefined>;
  createUser(user: InsertProfile): Promise<Profile>;
}

export class MemStorage implements IStorage {
  private users: Map<string, Profile>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<Profile | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<Profile | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === username,
    );
  }

  async createUser(insertUser: InsertProfile): Promise<Profile> {
    const id = randomUUID();
    const user: Profile = { 
      ...insertUser, 
      id, 
      fullName: insertUser.fullName ?? null,
      avatarUrl: insertUser.avatarUrl ?? null,
      createdAt: new Date() 
    };
    this.users.set(id, user);
    return user;
  }
}

export const storage = new MemStorage();
