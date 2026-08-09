const PROFESSIONAL_ROLE = "profissional";
const PREFERRED_CONTRACT_STATUSES = new Set(["pendente_assinatura", "aguardando_validacao", "ativo"]);

let currentContract = null;
let sendingContract = false;

const $ = (selector) => document.querySelector(selector);

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return new Intl.DateTimeFormat("pt-BR", includeTime
    ? { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }
    : { dateStyle: "short", timeZone: "UTC" }).format(date);
}

function formatPercentage(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("pt-BR")} %` : displayValue(value);
}

function professionalName(profile, professional, user) {
  return professional?.name || professional?.nome || profile?.full_name || profile?.nome || profile?.name
    || user?.user_metadata?.full_name || user?.user_metadata?.name || "Profissional";
}

function isPending(contract) {
  return contract?.status === "pendente_assinatura";
}

function isActive(contract) {
  return contract?.aceito === true && contract?.status === "ativo";
}

function isAwaitingValidation(contract) {
  return contract?.status === "aguardando_validacao";
}

function setMessage(text, type = "") {
  const element = $("#contract-message");
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function showToast(text) {
  $("#toast-message").textContent = text;
  $("#toast").hidden = false;
}

function routeForRole(role) {
  if (role === "admin" || role === "recepcao") return "admin.html";
  if (role === "cliente") return "cliente.html";
  return "login.html";
}

function redirectForRole(role) {
  window.location.replace(routeForRole(role));
}

function createDetail(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function renderContract() {
  const container = $("#contract-container");
  container.replaceChildren();
  if (!currentContract) {
    const empty = document.createElement("article");
    empty.className = "state-card";
    empty.innerHTML = "<strong>Nenhum contrato disponível</strong><p>Quando seu contrato estiver pronto, ele aparecerá aqui.</p>";
    container.appendChild(empty);
    return;
  }

  const card = document.createElement("article");
  card.className = "contract-card";
  const header = document.createElement("header");
  header.className = "contract-card-header";
  const title = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Contrato ${displayValue(currentContract.numero_contrato)}`;
  const heading = document.createElement("h2");
  heading.textContent = `Versão ${displayValue(currentContract.versao)}`;
  title.append(eyebrow, heading);
  const badge = document.createElement("span");
  badge.className = `status-badge ${isActive(currentContract) ? "active" : isPending(currentContract) ? "pending" : "neutral"}`;
  badge.textContent = isActive(currentContract) ? "Contrato ativo" : isPending(currentContract) ? "Pendente de assinatura" : displayValue(currentContract.status).replaceAll("_", " ");
  header.append(title, badge);

  const details = document.createElement("dl");
  details.className = "contract-details";
  details.append(
    createDetail("Número do contrato", displayValue(currentContract.numero_contrato)),
    createDetail("Versão", displayValue(currentContract.versao)),
    createDetail("Status", isActive(currentContract) ? "Contrato ativo" : displayValue(currentContract.status).replaceAll("_", " ")),
    createDetail("Início", formatDate(currentContract.data_inicio)),
    createDetail("Fim da experiência", formatDate(currentContract.data_fim_experiencia)),
    createDetail("Percentual na experiência", formatPercentage(currentContract.percentual_experiencia)),
    createDetail("Percentual após experiência", formatPercentage(currentContract.percentual_pos_experiencia)),
    createDetail("Assinatura validada", currentContract.aceito ? "Sim" : "Não"),
    createDetail("Validado em", formatDate(currentContract.aceito_em, true))
  );

  const actions = document.createElement("div");
  actions.className = "contract-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button-secondary";
  viewButton.textContent = "Visualizar contrato";
  viewButton.addEventListener("click", openContractModal);
  actions.appendChild(viewButton);
  if (isPending(currentContract)) {
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "button-secondary";
    downloadButton.textContent = "Baixar contrato";
    downloadButton.addEventListener("click", downloadContract);
    const uploadButton = document.createElement("button");
    uploadButton.id = "upload-signed-contract";
    uploadButton.type = "button";
    uploadButton.textContent = "Enviar contrato assinado";
    uploadButton.addEventListener("click", selectSignedContract);
    actions.append(downloadButton, uploadButton);
  }
  if (isAwaitingValidation(currentContract)) {
    const notice = document.createElement("p");
    notice.className = "message success";
    notice.textContent = "Seu contrato foi enviado para análise do Studio. A assinatura será conferida e, após a validação, o contrato ficará ativo.";
    card.append(header, details, notice, actions);
  } else {
    card.append(header, details, actions);
  }
  container.appendChild(card);
}

function downloadContract() {
  if (!currentContract?.conteudo_contrato) {
    setMessage("O conteúdo deste contrato ainda não está disponível para download.", "error");
    return;
  }
  const blob = new Blob([currentContract.conteudo_contrato], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const contractNumber = String(currentContract.numero_contrato || currentContract.id || "profissional").replace(/[^a-zA-Z0-9_-]/g, "-");
  link.href = url;
  link.download = `contrato-${contractNumber}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function selectSignedContract() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.addEventListener("change", () => {
    const [file] = input.files || [];
    if (file) sendSignedContract(file);
  }, { once: true });
  input.click();
}

function openContractModal() {
  if (!currentContract) return;
  $("#contract-modal-title").textContent = `Contrato ${displayValue(currentContract.numero_contrato)}`;
  $("#contract-full-content").textContent = displayValue(currentContract.conteudo_contrato);
  $("#pending-modal").hidden = true;
  $("#contract-modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#close-contract-modal").focus();
}

function closeModal(selector) {
  $(selector).hidden = true;
  if ($("#contract-modal").hidden && $("#pending-modal").hidden) document.body.classList.remove("modal-open");
}

async function loadContract() {
  const { data, error } = await supabaseClient
    .from("contratos_profissionais")
    .select("id, numero_contrato, versao, status, data_inicio, data_fim_experiencia, percentual_experiencia, percentual_pos_experiencia, aceito, aceito_em, conteudo_contrato, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const contracts = data || [];
  currentContract = contracts.find((contract) => PREFERRED_CONTRACT_STATUSES.has(contract.status)) || contracts[0] || null;
  renderContract();
  if (isPending(currentContract)) $("#pending-modal").hidden = false;
}

async function sendSignedContract(file) {
  if (!currentContract || !isPending(currentContract) || sendingContract) return;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    setMessage("Selecione um arquivo PDF assinado pelo GOV.BR.", "error");
    return;
  }
  sendingContract = true;
  const button = $("#upload-signed-contract");
  button.disabled = true;
  button.textContent = "Enviando...";
  setMessage("");
  // Referência temporária desta etapa. Deve ser substituída pela URL do Storage quando o upload for implementado.
  const temporaryFileUrl = URL.createObjectURL(file);
  try {
    const { error } = await supabaseClient.rpc("enviar_contrato_assinado_profissional", {
      p_contrato_id: currentContract.id,
      p_arquivo_assinado_url: temporaryFileUrl,
      p_tipo_assinatura: "gov_br",
      p_assinatura_referencia: null
    });
    if (error) throw error;
    await loadContract();
    setMessage("Seu contrato foi enviado para análise do Studio. A assinatura será conferida e, após a validação, o contrato ficará ativo.", "success");
    showToast("Contrato enviado para análise do Studio 💗");
  } catch (error) {
    console.error("Erro ao enviar contrato assinado:", error);
    setMessage(errorMessage(error, "Não foi possível enviar o contrato assinado. Tente novamente."), "error");
    button.disabled = false;
    button.textContent = "Enviar contrato assinado";
  } finally {
    URL.revokeObjectURL(temporaryFileUrl);
    sendingContract = false;
  }
}

function showSection(section) {
  const sectionTitles = {
    agenda: "Minha agenda",
    solicitacoes: "Solicitações",
    producao: "Produção",
    comissoes: "Comissões"
  };
  const target = section === "dashboard" ? "dashboard" : section === "contrato" ? "contrato" : "coming-soon";
  document.querySelectorAll(".panel-section").forEach((element) => {
    const active = element.id === `section-${target}`;
    element.hidden = !active;
    element.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.section === section;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  if (target === "coming-soon") $("#coming-soon-title").textContent = sectionTitles[section] || "Em breve";
}

async function initialize() {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) {
      window.location.replace("login.html");
      return;
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== PROFESSIONAL_ROLE) {
      redirectForRole(profile?.role);
      return;
    }

    const { data: professional, error: professionalError } = await supabaseClient
      .from("profissionais").select("*").eq("profile_id", session.user.id).eq("active", true).maybeSingle();
    if (professionalError) throw professionalError;
    if (!professional) {
      await supabaseClient.auth.signOut();
      window.location.replace(`login.html?message=${encodeURIComponent("Cadastro profissional ativo não encontrado.")}`);
      return;
    }

    const name = professionalName(profile, professional, session.user);
    $("#professional-name").textContent = name;
    $("#first-name").textContent = name.trim().split(/\s+/)[0];
    await loadContract();
    $("#page-loading").hidden = true;
    $("#professional-app").hidden = false;
  } catch (error) {
    console.error("Erro ao iniciar painel profissional:", error);
    await supabaseClient.auth.signOut();
    window.location.replace(`login.html?message=${encodeURIComponent("Não foi possível validar seu acesso profissional.")}`);
  }
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.section)));
$("#logout-button").addEventListener("click", async () => { await supabaseClient.auth.signOut(); window.location.replace("login.html"); });
$("#close-contract-modal").addEventListener("click", () => closeModal("#contract-modal"));
$("#close-contract-button").addEventListener("click", () => closeModal("#contract-modal"));
$("#dismiss-pending").addEventListener("click", () => closeModal("#pending-modal"));
$("#view-pending-contract").addEventListener("click", openContractModal);
$("#close-toast").addEventListener("click", () => { $("#toast").hidden = true; });
$("#contract-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal("#contract-modal"); });
$("#pending-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal("#pending-modal"); });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#contract-modal").hidden) closeModal("#contract-modal");
  else if (!$("#pending-modal").hidden) closeModal("#pending-modal");
});

initialize();
