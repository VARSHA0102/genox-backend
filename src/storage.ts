import { randomUUID } from "crypto";
import {
  type User,
  type InsertUser,
  type Contact,
  type InsertContact,
  type Newsletter,
  type InsertNewsletter,
} from "../shared/schema.js";

// Modify the interface with any CRUD methods you might need
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  insertContact(contact: InsertContact): Promise<Contact>;
  getAllContacts(): Promise<Contact[]>;
  insertNewsletter(newsletter: InsertNewsletter): Promise<Newsletter>;
  getNewsletterByEmail(email: string): Promise<Newsletter | undefined>;
  getAllNewsletterSubscriptions(): Promise<Newsletter[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private contacts: Map<string, Contact>;
  private newsletters: Map<string, Newsletter>;

  constructor() {
    this.users = new Map();
    this.contacts = new Map();
    this.newsletters = new Map();
  }

  // ---------------- USER METHODS ----------------

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();

    // Ensure all required User fields exist
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password,
    };

    this.users.set(id, user);
    return user;
  }

  // ---------------- CONTACT METHODS ----------------

  async insertContact(insertContact: InsertContact): Promise<Contact> {
    const id = randomUUID();

    // Fill all required fields explicitly
    const contact: Contact = {
      id,
      name: insertContact.name,
      email: insertContact.email,
      message: insertContact.message,
      company: insertContact.company ?? "",
      createdAt: new Date(),
    };

    this.contacts.set(id, contact);
    console.log(`✅ Contact stored: ${contact.name} (${contact.email})`);
    return contact;
  }

  async getAllContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  // ---------------- NEWSLETTER METHODS ----------------

  async insertNewsletter(insertNewsletter: InsertNewsletter): Promise<Newsletter> {
    const id = randomUUID();

    // Ensure all required Newsletter fields exist
    const newsletter: Newsletter = {
      id,
      email: insertNewsletter.email,
      createdAt: new Date(),
    };

    this.newsletters.set(id, newsletter);
    console.log(`📧 Newsletter subscription: ${newsletter.email}`);
    return newsletter;
  }

  async getNewsletterByEmail(email: string): Promise<Newsletter | undefined> {
    return Array.from(this.newsletters.values()).find(
      (newsletter) => newsletter.email === email
    );
  }

  async getAllNewsletterSubscriptions(): Promise<Newsletter[]> {
    return Array.from(this.newsletters.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
}

export const storage = new MemStorage();
