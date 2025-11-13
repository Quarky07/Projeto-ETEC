document.addEventListener('DOMContentLoaded', function () {

    // --- VARIÁVEIS GLOBAIS ---
    const API_URL = 'http://localhost:3000/api';
    const REFRESH_INTERVAL_MS = 15000; // Recarrega a cada 15 segundos
    let refreshTimer;

    let appState = {
        userId: null,
        userName: "Admin",
        userType: "admin",
        token: null,
        agendamentos: [],
        usuarios: [],
        materiais: []
    };

    // --- Toast Global ---
    const globalToastEl = document.getElementById('globalToast');
    const globalToast = globalToastEl ? new bootstrap.Toast(globalToastEl) : null;

    // --- INICIALIZAÇÃO ---
    checkLogin();
    if (appState.token) {
        iniciarCarregamentoDados();
        iniciarListeners();
        iniciarRefreshAutomatico(); // NOVO: Inicia o refresh
    }
    
    // --- Funções de Refresh ---
    function iniciarRefreshAutomatico() {
        if (refreshTimer) clearInterval(refreshTimer); 
        
        refreshTimer = setInterval(() => {
            console.log(`[Admin Refresh] Recarregando dados em background (${new Date().toLocaleTimeString()})...`);
            iniciarCarregamentoDados(true); // Chamada silenciosa
        }, REFRESH_INTERVAL_MS);
    }
    
    window.addEventListener('beforeunload', () => {
        if (refreshTimer) clearInterval(refreshTimer);
    });
    // --- Fim Funções de Refresh ---


    function checkLogin() {
        appState.userId = localStorage.getItem('userId');
        appState.userName = localStorage.getItem('userName');
        appState.userType = localStorage.getItem('userType');
        appState.token = localStorage.getItem('token');

        if (!appState.userId || !appState.userType || appState.userType !== 'admin' || !appState.token) {
            console.warn("Acesso não autorizado ou token inválido. Redirecionando para login.");
            localStorage.clear();
            window.location.href = 'telaLogin.html';
            return;
        }

        document.getElementById('nome-usuario').innerText = appState.userName;
        document.getElementById('tipo-usuario').innerText = appState.userType;
    }

    // --- Helper de Fetch ---
    async function fetchComToken(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.token}`,
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            // Token inválido ou expirado
            console.warn("Acesso negado: Token inválido ou expirado.");
            localStorage.clear();
            window.location.href = 'telaLogin.html';
            throw new Error('Token inválido ou expirado.');
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
        }

        if (response.status === 204) { // No Content
            return null;
        }

        return response.json();
    }


    // --- CARREGAMENTO DE DADOS (FETCH API) ---
    async function iniciarCarregamentoDados(silencioso = false) {
        try {
            // Carregar dados em paralelo
            const [agendamentos, usuarios, materiais] = await Promise.all([
                fetchComToken(`${API_URL}/admin/agendamentos`),
                fetchComToken(`${API_URL}/admin/usuarios`),
                fetchComToken(`${API_URL}/materiais`) // Rota compartilhada com tecnico
            ]);

            appState.agendamentos = agendamentos;
            appState.usuarios = usuarios;
            appState.materiais = materiais;

            // Renderizar tudo
            renderDashboard();
            renderAgendamentos();
            renderUsuarios();
            renderEstoque();
            renderEstatisticas(); // Corrigido o problema do callback

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            if (!silencioso) {
                showAlert("Falha ao carregar dados do servidor.", "Erro de Conexão", "error");
            }
            document.getElementById('lista-agendamentos-tbody').innerHTML = `<tr><td colspan="6" data-label="Erro" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
            document.getElementById('lista-usuarios-tbody').innerHTML = `<tr><td colspan="4" data-label="Erro" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
            document.getElementById('lista-estoque-tbody').innerHTML = `<tr><td colspan="5" data-label="Erro" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
        }
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO ---

    function renderDashboard() {
        const { agendamentos, usuarios, materiais } = appState;
        const pendentes = agendamentos.filter(a => a.status_agendamento === 'pendente').length;

        document.getElementById('card-agendamentos').innerText = agendamentos.length;
        document.getElementById('card-pendentes').innerText = pendentes;
        document.getElementById('card-usuarios').innerText = usuarios.length;
        document.getElementById('card-estoque').innerText = materiais.length;
    }

    function renderAgendamentos() {
        const tbody = document.getElementById('lista-agendamentos-tbody');
        if (appState.agendamentos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" data-label="Aviso" class="text-center">Nenhum agendamento encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = appState.agendamentos.map(aula => {
            const { statusClasse, statusTexto } = getStatusInfo(aula.status_agendamento);
            return `
                <tr data-id="${aula.id_agendamento}">
                    <td data-label="Status"><span class="badge ${statusClasse}">${statusTexto}</span></td>
                    <td data-label="Professor">${aula.nome_professor || 'N/A'}</td>
                    <td data-label="Laboratório">${aula.nome_laboratorio || 'N/A'}</td>
                    <td data-label="Data">${formatarData(aula.data_hora_inicio)}</td>
                    <td data-label="Horário">${formatarHorario(aula.data_hora_inicio)} - ${formatarHorario(aula.data_hora_fim)}</td>
                    <td data-label="Ações" class="text-center acoes-cell">
                        ${aula.status_agendamento === 'pendente' ?
                    `<button class="btn btn-sm btn-outline-success mx-1 btn-confirmar-agendamento" data-id="${aula.id_agendamento}">Confirmar</button>
                         <button class="btn btn-sm btn-outline-danger mx-1 btn-cancelar-agendamento" data-id="${aula.id_agendamento}">Cancelar</button>` :
                    (aula.status_agendamento === 'confirmado' ?
                        `<button class="btn btn-sm btn-outline-danger mx-1 btn-cancelar-agendamento" data-id="${aula.id_agendamento}">Cancelar</button>` :
                        'N/A')
                }
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderUsuarios() {
        const tbody = document.getElementById('lista-usuarios-tbody');
        if (appState.usuarios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" data-label="Aviso" class="text-center">Nenhum usuário cadastrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = appState.usuarios.map(user => `
            <tr data-id="${user.id}">
                <td data-label="Nome">${user.nome}</td>
                <td data-label="Email">${user.email}</td>
                <td data-label="Cargo">${user.tipo_usuario}</td>
                <td data-label="Ações" class="text-center acoes-cell">
                    <!-- <button class="btn btn-sm btn-outline-primary mx-1 btn-editar-usuario" data-id="${user.id}">Editar</button> -->
                    ${user.id != appState.userId ? // Não pode excluir a si mesmo
                `<button class="btn btn-sm btn-outline-danger mx-1 btn-remover-usuario" data-id="${user.id}">Remover</button>` :
                '(Usuário Atual)'}
                </td>
            </tr>
        `).join('');
    }

    function renderEstoque() {
        const tbody = document.getElementById('lista-estoque-tbody');
        if (appState.materiais.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" data-label="Aviso" class="text-center">Nenhum item no estoque.</td></tr>`;
            return;
        }

        tbody.innerHTML = appState.materiais.map(item => `
            <tr data-id="${item.id}">
                <td data-label="Item">${item.nome}</td>
                <td data-label="Descrição">${item.descricao || 'N/A'}</td>
                <td data-label="Tipo">${item.tipo_material}</td>
                <td data-label="Quantidade" class="text-center mobile-center">${item.quantidade} ${item.unidade}</td>
                <td data-label="Localização">${item.localizacao || 'N/A'}</td>
            </tr>
        `).join('');
    }

    function renderEstatisticas() {
        const { agendamentos, usuarios } = appState;

        // 1. Laboratório mais usado
        const labContagem = contarOcorrencias(agendamentos, "nome_laboratorio");
        const labMaisUsado = encontrarMaisFrequente(labContagem);
        document.getElementById("stat-lab-mais-usado").innerText = labMaisUsado || "Nenhum";

        // 2. Professor mais ativo
        const profContagem = contarOcorrencias(agendamentos, "nome_professor");
        const profMaisAtivo = encontrarMaisFrequente(profContagem);
        document.getElementById("stat-prof-ativo").innerText = profMaisAtivo || "Nenhum";

        // 3. Horario de pico
        const horarioContagem = contarOcorrencias(agendamentos, "data_hora_inicio", item => formatarHorario(item));
        const horarioPico = encontrarMaisFrequente(horarioContagem);
        document.getElementById("stat-horario-pico").innerText = horarioPico ? `${horarioPico}` : "Nenhum";

        // 4. Total de professores
        const totalProfessores = usuarios.filter(u => u.tipo_usuario === "professor").length;
        document.getElementById("stat-total-prof").innerText = totalProfessores;

        // Agendamentos concluídos
        const totalConcluidos = agendamentos.filter(a => a.status_agendamento === "concluido").length;
        document.getElementById("stat-concluidos").innerText = totalConcluidos;

        // Agendamentos cancelados
        const totalCancelados = agendamentos.filter(a => a.status_agendamento === "cancelado").length;
        document.getElementById("stat-cancelados").innerText = totalCancelados;

    }


    // --- LÓGICA DE EVENTOS E MODAIS ---
    function iniciarListeners() {

        // --- Navegação entre Seções ---
        const navLinks = document.querySelectorAll('.nav-link[data-target]');
        const sections = document.querySelectorAll('.conteudo-secao');
        const navbarCollapse = document.getElementById('navbarNav');

        navLinks.forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const targetId = link.getAttribute('data-target');
                sections.forEach(section => section.classList.remove('ativo'));
                const targetSection = document.getElementById(targetId);
                if (targetSection) targetSection.classList.add('ativo');

                navLinks.forEach(navLink => navLink.classList.remove('active'));
                link.classList.add('active');

                if (navbarCollapse.classList.contains('show')) {
                    const bsCollapse = new bootstrap.Collapse(navbarCollapse, { toggle: false });
                    bsCollapse.hide();
                }
            });
        });

        // --- Acessibilidade ---
        const body = document.body;
        const html = document.documentElement;
        const accessibilityBtn = document.getElementById('accessibilityBtn');
        const accessibilityDropdown = document.getElementById('accessibilityDropdown');

        if (accessibilityBtn && accessibilityDropdown) {
            accessibilityBtn.addEventListener('click', (e) => { e.stopPropagation(); accessibilityDropdown.classList.toggle('show'); });
        }
        window.addEventListener('click', (e) => {
            if (accessibilityDropdown && !accessibilityBtn.contains(e.target) && !accessibilityDropdown.contains(e.target)) {
                accessibilityDropdown.classList.remove('show');
            }
        });
        const darkModeToggle = document.getElementById('toggle-dark-mode');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', (e) => { e.preventDefault(); body.classList.toggle('dark-mode'); localStorage.setItem('darkMode', body.classList.contains('dark-mode')); });
        }
        if (localStorage.getItem('darkMode') === 'true') body.classList.add('dark-mode');
        const increaseFontBtn = document.getElementById('increase-font');
        const decreaseFontBtn = document.getElementById('decrease-font');
        if (increaseFontBtn) increaseFontBtn.addEventListener('click', (e) => { e.preventDefault(); changeFontSize(0.1); });
        if (decreaseFontBtn) decreaseFontBtn.addEventListener('click', (e) => { e.preventDefault(); changeFontSize(-0.1); });
        function changeFontSize(step) {
            const currentSize = parseFloat(getComputedStyle(html).getPropertyValue('--font-size-base'));
            const newSize = Math.max(0.7, currentSize + step);
            html.style.setProperty('--font-size-base', `${newSize}rem`);
        }
        const colorModeLinks = document.querySelectorAll('#accessibilityDropdown [data-mode]');
        colorModeLinks.forEach(link => {
            link.addEventListener('click', (e) => { e.preventDefault(); const mode = link.getAttribute('data-mode'); body.classList.remove('protanopia', 'deuteranopia', 'tritanopia'); if (mode !== 'normal') body.classList.add(mode); });
        });

        // --- VLibras ---
        if (window.VLibras) {
            new window.VLibras.Widget('https://vlibras.gov.br/app');
        }

        // --- Modal de Confirmação de Saída ---
        const modalConfirmarSaida = document.getElementById("modalConfirmarSaida");
        const btnFecharModalSaida = document.getElementById("fecharModalSaidaBtn");
        const btnCancelarSaida = document.getElementById("cancelarSaidaBtn");
        const btnConfirmarSaida = document.getElementById("confirmarSaidaBtn");
        const botaoSair = document.getElementById('botaoSair');

        function abrirModalSaida() { 
            if (modalConfirmarSaida) {
                modalConfirmarSaida.classList.add("visivel"); 
            } else {
                // Se não houver modal de confirmação, efetua o logout imediatamente
                localStorage.clear();
                window.location.href = 'telaLogin.html';
            }
        }
        function fecharModalSaida() { if (modalConfirmarSaida) modalConfirmarSaida.classList.remove("visivel"); }

        if (botaoSair) botaoSair.addEventListener("click", abrirModalSaida);
        if (btnFecharModalSaida) btnFecharModalSaida.addEventListener("click", fecharModalSaida);
        if (btnCancelarSaida) btnCancelarSaida.addEventListener("click", fecharModalSaida);
        if (btnConfirmarSaida) {
            btnConfirmarSaida.addEventListener("click", () => {
                localStorage.clear();
                window.location.href = 'telaLogin.html';
            });
        }
        adicionarCliqueFora(modalConfirmarSaida, fecharModalSaida);

        // --- Modal Cadastro Usuário ---
        const userModal = document.getElementById('userModal');
        const abrirUserModalBtn = document.getElementById('abrirModalBtn');
        const fecharUserModalBtn = document.getElementById('fecharModalBtn');
        const cancelarUserModalBtn = document.getElementById('cancelarModalBtn');
        const userForm = document.getElementById('formUsuario');
        const btnSalvarUsuario = userForm ? userForm.querySelector('.btn-success') : null;


        const abrirUserModal = () => { if (userModal) userModal.classList.add('visivel'); }
        const fecharUserModal = () => { if (userModal) userModal.classList.remove('visivel'); userForm.reset(); }

        if (abrirUserModalBtn) abrirUserModalBtn.addEventListener('click', abrirUserModal);
        if (fecharUserModalBtn) fecharUserModalBtn.addEventListener('click', fecharUserModal);
        if (cancelarUserModalBtn) cancelarUserModalBtn.addEventListener('click', fecharUserModal);
        adicionarCliqueFora(userModal, fecharUserModal);

        if (userForm) {
            userForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const novoUsuario = {
                    nome: document.getElementById('nome').value,
                    email: document.getElementById('email').value,
                    tipo_usuario: document.getElementById('cargo').value,
                    senha: document.getElementById('senha').value,
                };

                if (btnSalvarUsuario) {
                    btnSalvarUsuario.disabled = true;
                    btnSalvarUsuario.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Salvando...';
                }
                
                try {
                    const data = await fetchComToken(`${API_URL}/admin/usuarios`, {
                        method: 'POST',
                        body: JSON.stringify(novoUsuario)
                    });

                    fecharUserModal(); // Fecha o modal
                    showAlert(`Usuário "${data.nome}" cadastrado com sucesso!`, "Sucesso", "success");
                    location.reload(); // Recarrega
                } catch (error) {
                    console.error("Erro ao cadastrar usuário:", error);
                    showAlert(error.message, "Erro", "error");
                } finally {
                     if (btnSalvarUsuario) {
                        btnSalvarUsuario.disabled = false;
                        btnSalvarUsuario.innerHTML = 'Salvar Usuário';
                    }
                }
            });
        }

        // --- Modal Cadastro Estoque ---
        const estoqueModal = document.getElementById('estoqueModal');
        const abrirEstoqueModalBtn = document.getElementById('abrirModalEstoqueBtn');
        const fecharEstoqueModalBtn = document.getElementById('fecharModalEstoqueBtn');
        const cancelarEstoqueModalBtn = document.getElementById('cancelarModalEstoqueBtn');
        const estoqueForm = document.getElementById('formEstoque');
        const btnSalvarEstoque = estoqueForm ? estoqueForm.querySelector('.btn-success') : null;


        const abrirEstoqueModal = () => { if (estoqueModal) estoqueModal.classList.add('visivel'); }
        const fecharEstoqueModal = () => { if (estoqueModal) estoqueModal.classList.remove('visivel'); estoqueForm.reset(); atualizarInputValor('unidade'); }

        if (abrirEstoqueModalBtn) abrirEstoqueModalBtn.addEventListener('click', abrirEstoqueModal);
        if (fecharEstoqueModalBtn) fecharEstoqueModalBtn.addEventListener('click', fecharEstoqueModal);
        if (cancelarEstoqueModalBtn) cancelarEstoqueModalBtn.addEventListener('click', fecharEstoqueModal);
        adicionarCliqueFora(estoqueModal, fecharEstoqueModal);

        if (estoqueForm) {
            estoqueForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                
                // --- Mapeamento CORRIGIDO para a API ---
                const itemTipoUnidade = document.getElementById('itemTipoUnidade').value;
                let unidade = 'unidades';
                let tipo_material = 'equipamento'; 
                let classificacao = 'ferramenta'; 
                let quantidadeFloat = parseFloat(document.getElementById('itemValor').value);

                switch (itemTipoUnidade) {
                    case 'peso':
                        unidade = 'g';
                        tipo_material = 'reagente'; 
                        classificacao = 'consumivel';
                        break;
                    case 'litros':
                        unidade = 'mL';
                        tipo_material = 'reagente'; 
                        classificacao = 'consumivel';
                        break;
                    case 'unidade':
                        unidade = 'unidades';
                        tipo_material = 'equipamento'; 
                        classificacao = 'ferramenta';
                        break;
                    default:
                        unidade = 'unidades';
                }
                
                const novoItem = {
                    nome: document.getElementById('itemNome').value,
                    descricao: document.getElementById('itemDesc').value,
                    localizacao: document.getElementById('itemLocal').value,
                    tipo_material: tipo_material, 
                    classificacao: classificacao, 
                    quantidade: quantidadeFloat,
                    unidade: unidade
                };
                // ----------------------------------------
                
                if (btnSalvarEstoque) {
                    btnSalvarEstoque.disabled = true;
                    btnSalvarEstoque.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Salvando...';
                }


                try {
                    const data = await fetchComToken(`${API_URL}/materiais`, {
                        method: 'POST',
                        body: JSON.stringify(novoItem)
                    });
                    
                    fecharEstoqueModal(); // Fecha o modal
                    showAlert(`Item "${data.nome}" cadastrado com sucesso!`, "Sucesso", "success");
                    location.reload(); // Recarrega
                } catch (error) {
                    console.error("Erro ao cadastrar item:", error);
                    showAlert(error.message, "Erro", "error");
                } finally {
                     if (btnSalvarEstoque) {
                        btnSalvarEstoque.disabled = false;
                        btnSalvarEstoque.innerHTML = 'Salvar Item';
                    }
                }
            });
        }

        // Lógica condicional (Unidade/Peso/Litros) do modal de estoque
        const tipoUnidadeSelect = document.getElementById('itemTipoUnidade');
        if (tipoUnidadeSelect) {
            tipoUnidadeSelect.addEventListener('change', (e) => {
                atualizarInputValor(e.target.value);
            });
        }

        // --- Ações Dinâmicas (Delegação de Eventos) ---

        // Ações na Tabela de Agendamentos
        document.getElementById('lista-agendamentos-tbody').addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;
            if (!id) return;

            const isConfirm = target.classList.contains('btn-confirmar-agendamento');
            const originalText = target.innerHTML;
            
            // Feedback visual do botão
            target.disabled = true;
            target.innerHTML = isConfirm ? '<i class="bi bi-hourglass-split me-2"></i>Confirmando...' : '<i class="bi bi-hourglass-split me-2"></i>Cancelando...';
            
            let status = isConfirm ? 'confirmado' : 'cancelado';
            
            try {
                // Rota do técnico é usada, mas o admin está autenticado
                await fetchComToken(`${API_URL}/tecnico/agendamentos/${id}/status`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: status })
                });
                showAlert(`Agendamento ${status} com sucesso!`, 'Sucesso', 'success');
                location.reload();
            } catch (error) {
                showAlert(error.message, 'Erro', 'error');
            } finally {
                // Restaura o botão em caso de erro
                target.disabled = false;
                target.innerHTML = originalText;
            }
        });

        // Ações na Tabela de Usuários
        document.getElementById('lista-usuarios-tbody').addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;
            if (!id || !target.classList.contains('btn-remover-usuario')) return;

            const originalText = target.innerHTML;

            // TODO: Adicionar modal de confirmação "Tem certeza?"
            target.disabled = true;
            target.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Removendo...';

            try {
                await fetchComToken(`${API_URL}/admin/usuarios/${id}`, {
                    method: 'DELETE'
                });
                showAlert('Usuário removido com sucesso.', 'Sucesso', 'success');
                location.reload();
            } catch (error) {
                showAlert(error.message, 'Erro ao remover', 'error');
            } finally {
                target.disabled = false;
                target.innerHTML = originalText;
            }
        });

    } // Fim de iniciarListeners()


    // --- FUNÇÕES AUXILIARES ---

    function adicionarCliqueFora(modalElement, fecharFn) {
        if (modalElement) {
            modalElement.addEventListener('click', (event) => {
                if (event.target === modalElement) {
                    fecharFn();
                }
            });
        }
    }

    function atualizarInputValor(tipo) {
        const containerValor = document.getElementById('containerValorEstoque');
        if (!containerValor) return;
        const valorLabel = containerValor.querySelector('label');
        const valorInput = containerValor.querySelector('input');
        if (!valorLabel || !valorInput) return;

        switch (tipo) {
            case 'unidade':
                valorLabel.textContent = 'Quantidade (UN)';
                valorInput.step = '1';
                valorInput.min = '1';
                valorInput.placeholder = 'Ex: 10';
                break;
            case 'peso':
                valorLabel.textContent = 'Peso (g)';
                valorInput.step = '0.01';
                valorInput.min = '0.01';
                valorInput.placeholder = 'Ex: 500.5';
                break;
            case 'litros':
                valorLabel.textContent = 'Volume (ml)';
                valorInput.step = '0.1';
                valorInput.min = '0.1';
                valorInput.placeholder = 'Ex: 250.5';
                break;
        }
    }

    function showAlert(message, title = "Notificação", type = "info") {
        if (!globalToast) {
            console.log(`[Alerta: ${title}] ${message}`);
            return;
        }

        const toastTitle = document.getElementById('toastTitle');
        const toastBody = document.getElementById('toastBody');
        const toastIconContainer = toastTitle.querySelector('i'); // Pega o <i> existente

        // Limpa classes de cor
        globalToastEl.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning', 'text-bg-info');

        let iconClass = '';
        if (type === 'success') {
            globalToastEl.classList.add('text-bg-success');
            iconClass = 'bi-check-circle-fill';
        } else if (type === 'error') {
            globalToastEl.classList.add('text-bg-danger');
            iconClass = 'bi-x-circle-fill';
        } else if (type === 'warning') {
            globalToastEl.classList.add('text-bg-warning');
            iconClass = 'bi-exclamation-triangle-fill';
        } else {
            globalToastEl.classList.add('text-bg-info');
            iconClass = 'bi-info-circle-fill';
        }

        // Atualiza o ícone e o título
        if (toastIconContainer) {
            toastIconContainer.className = `bi ${iconClass} me-2`;
        }
        toastTitle.childNodes[1].nodeValue = ` ${title}`; // Atualiza o texto do título
        toastBody.innerText = message;

        globalToast.show();
    }

    function getStatusInfo(status) {
        switch (status) {
            case 'confirmado':
                return { statusClasse: 'bg-success', statusTexto: 'Confirmado' };
            case 'pendente':
                return { statusClasse: 'bg-warning text-dark', statusTexto: 'Pendente' };
            case 'cancelado':
                return { statusClasse: 'bg-danger', statusTexto: 'Cancelado' };
            case 'concluido':
                return { statusClasse: 'bg-secondary', statusTexto: 'Concluído' };
            default:
                return { statusClasse: 'bg-light text-dark', statusTexto: '?' };
        }
    }

    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        try {
            const dataObj = new Date(dataString);
            // Usando UTC para evitar problemas de fuso horário
            const dia = String(dataObj.getUTCDate()).padStart(2, '0');
            const mes = String(dataObj.getUTCMonth() + 1).padStart(2, '0');
            const ano = dataObj.getUTCFullYear();
            return `${dia}/${mes}/${ano}`;
        } catch (e) {
            return dataString.split('T')[0];
        }
    }

    function formatarHorario(dataString) {
        if (!dataString) return 'N/A';
        try {
            const dataObj = new Date(dataString);
            // Usando UTC para evitar problemas de fuso horário
            const horas = String(dataObj.getUTCHours()).padStart(2, '0');
            const minutos = String(dataObj.getUTCMinutes()).padStart(2, '0');
            return `${horas}:${minutos}`;
        } catch (e) {
            return '00:00';
        }
    }

    // --- Funções auxiliares para estatística ---
    
    /**
     * Conta ocorrências de uma chave em um array de objetos.
     * @param {Array} array - O array de dados 
     * @param {string} chave - A chave para contar 
     * @param {Function} [transform] - Função para transformar o valor antes de contar
     * @returns {Object} - Um objeto com as contagens
     */
    function contarOcorrencias(array, chave, transform = null) {
        if (!array || array.length === 0) return {};
        
        return array.reduce((acc, item) => {
            let valor = item[chave];
            if (transform) {
                valor = transform(valor); // ex: extrai a hora da data completa
            }
            
            if (valor) {
                acc[valor] = (acc[valor] || 0) + 1;
            }
            return acc;
        }, {});
    }

    /**
     * Encontra a chave com o maior valor em um objeto de contagem.
     * @param {Object} contagemObj - O objeto
     * @returns {string} - A chave com a maior contage
     */
    function encontrarMaisFrequente(contagemObj) {
        if (!contagemObj || Object.keys(contagemObj).length === 0) return null;

        return Object.keys(contagemObj).reduce((a, b) => 
            contagemObj[a] > contagemObj[b] ? a : b
        );
    }


});