import { Collection, MongoClient } from 'mongodb';
import dotenv from 'dotenv';

export const collections: { users?: Collection, admins?: Collection } = {}

export async function connectToDatabase () {
    dotenv.config();
    const client = new MongoClient(process.env.DB_CONNECTION_STRING as string);
    await client.connect();
    const db = client.db(process.env.DB_NAME as string);
    collections.users = db.collection(process.env.DB_USERS as string);
    collections.admins = db.collection(process.env.DB_ADMINS as string);
}