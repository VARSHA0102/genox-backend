import { randomUUID } from "crypto";
export class MemStorage {
    users;
    contacts;
    newsletters;
    constructor() {
        this.users = new Map();
        this.contacts = new Map();
        this.newsletters = new Map();
    }
    // ---------------- USER METHODS ----------------
    async getUser(id) {
        return this.users.get(id);
    }
    async getUserByUsername(username) {
        return Array.from(this.users.values()).find((user) => user.username === username);
    }
    async createUser(insertUser) {
        const id = randomUUID();
        // Ensure all required User fields exist
        const user = {
            id,
            username: insertUser.username,
            password: insertUser.password,
        };
        this.users.set(id, user);
        return user;
    }
    // ---------------- CONTACT METHODS ----------------
    async insertContact(insertContact) {
        const id = randomUUID();
        // Fill all required fields explicitly
        const contact = {
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
    async getAllContacts() {
        return Array.from(this.contacts.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    // ---------------- NEWSLETTER METHODS ----------------
    async insertNewsletter(insertNewsletter) {
        const id = randomUUID();
        // Ensure all required Newsletter fields exist
        const newsletter = {
            id,
            email: insertNewsletter.email,
            createdAt: new Date(),
        };
        this.newsletters.set(id, newsletter);
        console.log(`📧 Newsletter subscription: ${newsletter.email}`);
        return newsletter;
    }
    async getNewsletterByEmail(email) {
        return Array.from(this.newsletters.values()).find((newsletter) => newsletter.email === email);
    }
    async getAllNewsletterSubscriptions() {
        return Array.from(this.newsletters.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
}
export const storage = new MemStorage();
