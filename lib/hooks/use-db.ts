import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export function useSupabaseData<T>(
  table: string,
  options?: {
    select?: string
    filter?: { column: string; value: string }
    limit?: number
  }
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        let query = supabase.from(table).select(options?.select || '*')

        if (options?.filter) {
          query = query.eq(options.filter.column, options.filter.value)
        }

        if (options?.limit) {
          query = query.limit(options.limit)
        }

        const { data, error } = await query

        if (error) throw error
        setData(data as T[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [table, options])

  return { data, loading, error }
}

export function useSupabaseUser() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        setUser(data.user)
      } catch (err) {
        console.error('Error getting user:', err)
      } finally {
        setLoading(false)
      }
    }

    getUser()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  return { user, loading }
}
