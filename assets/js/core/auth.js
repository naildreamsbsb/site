import { supabaseClient } from "../supabase.js"

export async function loginWithGoogle() {
  console.log("🚀 iniciando login Google")

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/naildreams_site_v5_novo_agendamento/"
    }
  })

  if (error) {
    console.error("ERRO LOGIN:", error)
  }
}

supabaseClient.auth.onAuthStateChange(async (event, session) => {
  console.log("🔥 EVENT:", event)
  console.log("🔥 SESSION:", session)

  if (event === "SIGNED_IN" && session) {
    const user = session.user

    console.log("USUÁRIO LOGADO:", user)
  }
})

export async function logout() {
  const { error } = await supabaseClient.auth.signOut()

  if (error) {
    console.error("Erro ao deslogar:", error)
  } else {
    console.log("Logout realizado com sucesso")
  }

  window.location.reload()
}

window.logout = logout