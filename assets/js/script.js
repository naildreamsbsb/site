
import { supabaseClient } from "./supabase.js"
import { loginWithGoogle } from "./core/auth.js"

console.log("SCRIPT CARREGADO")

// expõe login global (necessário pro botão HTML)
window.loginWithGoogle = loginWithGoogle

// logout único e seguro
async function logout() {
  await supabaseClient.auth.signOut()
  location.reload()
}

window.logout = logout

// 🔥 FUNÇÃO ÚNICA DE UI
function updateUI(session) {

  const loginBtn = document.querySelector("[onclick='loginWithGoogle()']")

  if (session?.user) {

    // esconde botão login
    if (loginBtn) loginBtn.style.display = "none"

    // cria container do usuário se não existir
    let userBox = document.getElementById("userBox")

    if (!userBox) {
      userBox = document.createElement("div")
      userBox.id = "userBox"

      // estilo direto (sem CSS externo obrigatório)
      userBox.style.position = "fixed"
      userBox.style.top = "12px"
      userBox.style.right = "12px"
      userBox.style.display = "flex"
      userBox.style.alignItems = "center"
      userBox.style.gap = "10px"
      userBox.style.background = "#fff"
      userBox.style.padding = "6px 10px"
      userBox.style.borderRadius = "40px"
      userBox.style.boxShadow = "0 3px 12px rgba(0,0,0,0.15)"
      userBox.style.zIndex = "9999"

      document.body.appendChild(userBox)
    }

    const avatar = session.user.user_metadata?.avatar_url || ""

    userBox.innerHTML = `
      <img src="${avatar}" 
           style="width:38px;height:38px;border-radius:50%;object-fit:cover">
      <button onclick="logout()" 
              style="border:none;background:#3b2a22;color:#fff;
                     padding:6px 10px;border-radius:20px;cursor:pointer;">
        Sair
      </button>
    `

  } else {

    // mostra botão login
    if (loginBtn) loginBtn.style.display = "block"

    // remove UI usuário
    const userBox = document.getElementById("userBox")
    if (userBox) userBox.remove()
  }
}

// 🔥 INICIALIZA AUTH (base estável)
async function initAuth() {

  console.log("verificando sessão...")

  const { data } = await supabaseClient.auth.getSession()

  console.log("SESSION BOOT:", data)

  updateUI(data.session)

  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("EVENT:", event)
    console.log("SESSION:", session)

    updateUI(session)

    console.log("SESSION TEST:", data.session)
  })
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log("EVENT TEST:", event)
  console.log("SESSION TEST:", session)
})

initAuth()