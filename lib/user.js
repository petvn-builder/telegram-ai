import { getSupabaseAdmin } from "./supabase/admin";

const supabase = getSupabaseAdmin();

export async function getOrCreateUser(telegramId, username) {
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  if (existingUser) return existingUser

  const { data: newUser, error } = await supabase
    .from('users')
    .insert([
      {
        telegram_id: telegramId,
        username: username,
      },
    ])
    .select()
    .single()

  if (error) throw error

  return newUser
}

export async function resetIfNewDay(user) {
  const today = new Date().toISOString().split('T')[0]

  if (user.last_reset !== today) {
    const { data, error } = await supabase
      .from('users')
      .update({
        daily_count: 0,
        last_reset: today,
      })
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  return user
}

export async function isLimitReached(user) {
  return user.daily_count >= user.daily_limit
}

export async function incrementUsage(userId) {
  const { error } = await supabase.rpc('increment_daily_count', {
    user_id: userId,
  })

  if (error) throw error
}
