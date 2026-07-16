import { supabase, getServerSupabase } from './supabase'

// Client-side queries (use from React components)
export const db = {
  // Example: Get all users
  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
    
    if (error) throw error
    return data
  },

  // Example: Get single user by ID
  async getUserById(id: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  // Example: Insert a new user
  async createUser(user: { email: string; name: string }) {
    const { data, error } = await supabase
      .from('users')
      .insert([user])
      .select()
    
    if (error) throw error
    return data[0]
  },

  // Example: Update user
  async updateUser(id: string, updates: any) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
    
    if (error) throw error
    return data[0]
  },

  // Example: Delete user
  async deleteUser(id: string) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },
}

// Server-side queries (use from API routes)
export const serverDb = {
  async getUsers() {
    const client = getServerSupabase()
    const { data, error } = await client
      .from('users')
      .select('*')
    
    if (error) throw error
    return data
  },

  async getUserById(id: string) {
    const client = getServerSupabase()
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  async createUser(user: { email: string; name: string }) {
    const client = getServerSupabase()
    const { data, error } = await client
      .from('users')
      .insert([user])
      .select()
    
    if (error) throw error
    return data[0]
  },
}
