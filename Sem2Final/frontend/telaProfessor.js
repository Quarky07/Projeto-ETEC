document.addEventListener("DOMContentLoaded", function () {

    // --- VARIÁVEIS GLOBAIS ---
    let appState = {
        userId: null,
        userName: "Professor",
        userType: "professor",
        token: null,
        agendamentos: [],
        kits: [],
        laboratorios: [],
        materiais: [] // Armazena todos os materiais do estoque
    };
    
    // Timer para refresh automático
    const REFRESH_INTERVAL_MS = 15000;
    let refreshTimer;

    // Instâncias dos seletores de materiais
    let agendamentoSelector, novoKitSelector, editKitSelector;

    // --- Toast Global ---
    const globalToastEl = document.getElementById('globalToast');
    const globalToast = globalToastEl ? new bootstrap.Toast(globalToastEl) : null;

    // --- CAMADA DE SERVIÇO (Lógica de API) ---
    if (!window.apiService) {
        console.error("apiService.js não foi carregado corretamente.");
        showAlert("Erro crítico ao carregar a página. Recarregue.", "Erro", "error");
        return;
    }

    // --- INICIALIZAÇÃO ---
    checkLogin();
    if (appState.token) {
        iniciarCarregamentoDados();
        iniciarListenersGlobais();
        iniciarListenersFormularios();
        iniciarListenersDinamicos();
        iniciarRefreshAutomatico(); // NOVO: Inicia o refresh
    }
    
    // --- Funções de Refresh ---
    function iniciarRefreshAutomatico() {
        if (refreshTimer) clearInterval(refreshTimer); 
        
        refreshTimer = setInterval(() => {
            console.log(`[Professor Refresh] Recarregando dados em background (${new Date().toLocaleTimeString()})...`);
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

        if (!appState.userId || !appState.userType || appState.userType !== 'professor' || !appState.token) {
            console.warn("Acesso não autorizado ou token inválido. Redirecionando para login.");
            localStorage.clear();
            window.location.href = 'telaLogin.html';
            return;
        }

        document.getElementById('nome-usuario').innerText = appState.userName;
        document.getElementById('tipo-usuario').innerText = appState.userType;
    }

    // --- CARREGAMENTO DE DADOS (ATUALIZADO - Tarefas 1 e 4) ---
    async function iniciarCarregamentoDados(silencioso = false) {
        try {
            // Carregar dados em paralelo
            const [agendamentos, kits, laboratorios, materiais] = await Promise.all([
                window.apiService.getAgendamentosProfessor(),
                window.apiService.getKits(),
                window.apiService.getLaboratorios(),
                window.apiService.getMateriais() 
            ]);

            appState.agendamentos = agendamentos;
            appState.kits = kits;
            appState.laboratorios = laboratorios;
            appState.materiais = materiais; 

            // Renderizar todas as seções
            renderDashboardCards();
            renderProximasAulas();
            renderHistorico();
            renderMeusKits();
            
            if (!agendamentoSelector) {
                 inicializarSeletoresDeMateriais();
                 renderFormularioAgendamento(); 
                 configurarBotaoUltimoAgendamento();
            } else {
                 // Se os seletores já existirem, apenas recarrega as listas internas
                 agendamentoSelector.renderDisponiveis(); 
                 novoKitSelector.renderDisponiveis();
                 editKitSelector.renderDisponiveis();
            }

        } catch (error) {
            console.error("Erro fatal ao carregar dados:", error);
            if (!error.message.includes("expirou") && !silencioso) {
                showAlert(error.message, "Erro de Conexão", "error");
            }
            // Manter os placeholders de erro se falhar
        }
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO (Inalteradas) ---
    function renderDashboardCards() {
        const agora = new Date();
        const proximos = appState.agendamentos.filter(a => new Date(a.data_hora_inicio) > agora && a.status_agendamento !== 'cancelado');
        const preparados = proximos.filter(a => a.status_agendamento === 'confirmado');
        const aguardando = proximos.filter(a => a.status_agendamento === 'pendente');
        document.getElementById('card-proximas-aulas').innerText = proximos.length;
        document.getElementById('card-kits-preparados').innerText = preparados.length;
        document.getElementById('card-aguardando').innerText = aguardando.length;
        document.getElementById('card-meus-kits').innerText = appState.kits.length;
    }
    function renderProximasAulas() {
        const container = document.getElementById('lista-proximas-aulas');
        const agora = new Date();
        const proximosAgendamentos = appState.agendamentos.filter(a => 
            new Date(a.data_hora_inicio) > agora && a.status_agendamento !== 'cancelado'
        ).sort((a, b) => new Date(a.data_hora_inicio) - new Date(b.data_hora_inicio));
        if (proximosAgendamentos.length === 0) {
            container.innerHTML = '<p class="text-center p-3">Nenhuma aula agendada.</p>';
            return;
        }
        container.innerHTML = proximosAgendamentos.map(aula => `
            <article class="card-aulas status-${aula.status_agendamento}" data-id="${aula.id_agendamento}">
                <div class="aula-cabecalho">
                    <div>
                        <span class="status-texto">${aula.status_agendamento}</span>
                        <h3 class="titulo">${aula.observacoes || 'Aula experimental'}</h3> 
                    </div>
                    <div class="data-horario">
                        <span>${formatarData(aula.data_hora_inicio)} - ${formatarHorario(aula.data_hora_inicio)}-${formatarHorario(aula.data_hora_fim)}</span>
                        <small>${aula.nome_laboratorio || 'Laboratório a definir'}</small>
                    </div>
                </div>
                <div class="aula-main">
                    <div class="aula-info"><span>Kit:</span> ${aula.nome_kit || 'Nenhum'}</div>
                    <div class="aula-info"><span>Status:</span> ${getStatusIcone(aula.status_agendamento)} ${aula.status_agendamento}</div>
                </div>
                <div class="aula-detalhes">
                    <button class="btn btn-link btn-ver-detalhes" data-id="${aula.id_agendamento}">Ver detalhes</button>
                    ${aula.status_agendamento === 'pendente' ? 
                        `<button class="btn btn-link btn-link-danger btn-cancelar-aula" data-id="${aula.id_agendamento}">Cancelar</button>` : 
                        ''}
                </div>
            </article>
        `).join('');
    }
    function renderHistorico() {
        const container = document.getElementById('lista-historico');
        const agora = new Date();
        const historico = appState.agendamentos.filter(a => 
            new Date(a.data_hora_inicio) <= agora || a.status_agendamento === 'cancelado'
        ).sort((a, b) => new Date(b.data_hora_inicio) - new Date(a.data_hora_inicio));
        if (historico.length === 0) {
            container.innerHTML = '<tr><td colspan="5" data-label="Aviso" class="text-center">Nenhum histórico encontrado.</td></tr>';
            return;
        }
        container.innerHTML = historico.map(aula => `
            <tr data-id="${aula.id_agendamento}">
                <td data-label="Experimento">${aula.observacoes || 'Aula experimental'}</td>
                <td data-label="Laboratório">${aula.nome_laboratorio || 'N/A'}</td>
                <td data-label="Kit">${aula.nome_kit || 'N/A'}</td>
                <td data-label="Data">${formatarData(aula.data_hora_inicio)}</td>
                <td data-label="Status" class="text-center mobile-center">
                    <span class="status-texto status-${aula.status_agendamento}">${aula.status_agendamento}</span>
                </td>
            </tr>
        `).join('');
    }
    
    // (Tarefas 1 e 4) - MODIFICADO: A descrição (itens) agora vem de 'kit.materiais'
    function renderMeusKits() {
        const container = document.getElementById('lista-meus-kits');
        if (appState.kits.length === 0) {
            container.innerHTML = '<p class="text-center p-3">Nenhum kit personalizado criado.</p>';
            return;
        }
        container.innerHTML = appState.kits.map(kit => {
            // Cria a descrição a partir da lista de materiais
            const descricaoItens = kit.materiais && kit.materiais.length > 0
                ? kit.materiais.map(m => `- ${m.quantidade} ${m.unidade || ''} de ${m.nome} (${m.formato})`).join('\n')
                : 'Kit vazio.';

            return `
            <div class="col-md-6 col-lg-4">
                <article class="cards-kits h-100" data-id="${kit.id}">
                    <div class="card-body d-flex flex-column">
                        <header class="cabecalho">
                            <h3 class="titulo">${kit.nome_kit}</h3>
                        </header>
                        <pre class="descricao">${descricaoItens}</pre> 
                        <div class="data-utilizado mt-auto"></div>
                    </div>
                    <footer class="card-footer acoes">
                        <button class="btn btn-link btn-ver-kit" data-id="${kit.id}">Ver</button>
                        <button class="btn btn-link btn-editar-kit" data-id="${kit.id}">Editar</button>
                        <button class="btn btn-link btn-link-danger btn-excluir-kit" data-id="${kit.id}">Excluir</button>
                    </footer>
                </article>
            </div>
        `}).join('');
    }
    
    // ATUALIZADO (Tarefas 1 e 4): Agora só renderiza os labs e o dropdown de kits
    function renderFormularioAgendamento() {
        const labContainer = document.getElementById('lista-laboratorios-form');
        if (appState.laboratorios.length > 0) {
            labContainer.innerHTML = appState.laboratorios.map((lab, index) => `
                <div class="col-md-4">
                    <div class="laboratorios-card">
                        <input type="radio" name="laboratorio" id="lab${lab.id}" value="${lab.id}" class="laboratorios-card-input" ${index === 0 ? 'checked' : ''} required>
                        <label for="lab${lab.id}" class="laboratorios-card-conteudo">
                            <strong>${lab.nome_laboratorio}</strong>
                            <small>${lab.localizacao_sala || 'Localização N/A'}</small>
                            <small>${lab.descricao || 'Sem descrição'}</small>
                        </label>
                    </div>
                </div>
            `).join('');
        } else {
            labContainer.innerHTML = '<p class="text-center text-danger">Nenhum laboratório encontrado.</p>';
        }

        const kitSelect = document.getElementById('select-kit-existente');
        if (appState.kits.length > 0) {
            kitSelect.innerHTML = '<option value="" selected>Nenhum (ou selecione um kit para preencher a lista)</option>';
            appState.kits.forEach(kit => {
                kitSelect.innerHTML += `<option value="${kit.id}">${kit.nome_kit}</option>`;
            });
        } else {
            kitSelect.innerHTML = '<option value="" disabled>Nenhum kit personalizado encontrado.</option>';
        }
    }


    // --- (Tarefas 1 e 4) LÓGICA DO SELETOR DE MATERIAIS ---

    /**
     * Cria um seletor de materiais interativo.
     * Retorna um objeto com métodos para manipular a lista de materiais.
     * @param {string} context - O prefixo dos IDs (ex: 'Agendamento', 'Kit', 'EditKit')
     */
    function createMaterialSelector(context) {
        const filtroEl = document.getElementById(`filtroMateriais${context}`);
        const disponiveisEl = document.getElementById(`listaMateriaisDisponiveis${context}`);
        const selecionadosEl = document.getElementById(`listaMateriaisSelecionados${context}`);
        const placeholderEl = document.getElementById(`placeholderSelecionados${context}`);

        let selectedItems = []; // Estado interno

        function init() {
            // Listener do filtro
            if (filtroEl) {
                filtroEl.addEventListener('input', () => renderDisponiveis());
            }
            
            // Listeners da lista de disponíveis (Adicionar)
            if (disponiveisEl) {
                disponiveisEl.addEventListener('click', (e) => {
                    const target = e.target.closest('.btn-add-material');
                    if (target) {
                        const id = target.dataset.id;
                        addItem(id);
                    }
                });
            }

            // Listeners da lista de selecionados (Remover, Qtd, Formato)
            if (selecionadosEl) {
                selecionadosEl.addEventListener('click', (e) => {
                    // Remover
                    const removeBtn = e.target.closest('.btn-remove-material');
                    if (removeBtn) {
                        removeItem(removeBtn.dataset.id);
                    }
                });
                
                selecionadosEl.addEventListener('change', (e) => {
                    const id = e.target.dataset.id;
                    if (!id) return;
                    
                    // Atualizar Quantidade
                    if (e.target.classList.contains('input-qtd-material')) {
                        updateItem(id, 'quantidade', parseFloat(e.target.value) || 1);
                    }
                    // (Tarefa 4) Atualizar Formato (Sólido/Solução)
                    if (e.target.classList.contains('input-formato-material')) {
                        updateItem(id, 'formato', e.target.value);
                    }
                });
            }
            
            renderDisponiveis();
            renderSelecionados();
        }

        // Renderiza a lista de materiais disponíveis (filtrada)
        function renderDisponiveis() {
            if (!disponiveisEl) return;
            
            const filtro = filtroEl ? filtroEl.value.toLowerCase() : '';
            const selectedIds = new Set(selectedItems.map(item => item.id_material));

            const disponiveis = appState.materiais.filter(item => {
                const jaSelecionado = selectedIds.has(item.id);
                const correspondeFiltro = item.nome.toLowerCase().includes(filtro) || 
                                         item.tipo_material.toLowerCase().includes(filtro);
                return !jaSelecionado && correspondeFiltro;
            });

            if (disponiveis.length === 0) {
                disponiveisEl.innerHTML = `<p class="text-center text-muted small p-3">Nenhum material encontrado.</p>`;
                return;
            }

            disponiveisEl.innerHTML = disponiveis.map(item => `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2">
                    <div class="me-2">
                        <strong class="d-block">${item.nome}</strong>
                        <small class="text-muted">${item.tipo_material} (${item.quantidade} ${item.unidade} em estoque)</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-success btn-add-material" data-id="${item.id}">
                        <i class="bi bi-plus-lg"></i>
                    </button>
                </div>
            `).join('');
        }

        // Renderiza a lista de materiais selecionados
        function renderSelecionados() {
            if (!selecionadosEl) return;

            if (selectedItems.length === 0) {
                if(placeholderEl) placeholderEl.style.display = 'block';
                selecionadosEl.innerHTML = ''; // Limpa a lista
                return;
            }
            
            if(placeholderEl) placeholderEl.style.display = 'none';

            selecionadosEl.innerHTML = selectedItems.map(item => {
                // (Tarefa 4) Lógica para Sólido/Solução
                let formatoHtml = '';
                if (item.tipo_material === 'reagente') {
                    formatoHtml = `
                        <div class="d-flex gap-2 mt-1">
                            <div class="form-check form-check-inline">
                                <input class="form-check-input input-formato-material" type="radio" 
                                       name="formato-${context}-${item.id_material}" id="formato-solido-${context}-${item.id_material}" 
                                       value="solido" data-id="${item.id_material}" ${item.formato === 'solido' ? 'checked' : ''}>
                                <label class="form-check-label small" for="formato-solido-${context}-${item.id_material}">Sólido</label>
                            </div>
                            <div class="form-check form-check-inline">
                                <input class="form-check-input input-formato-material" type="radio" 
                                       name="formato-${context}-${item.id_material}" id="formato-solucao-${context}-${item.id_material}" 
                                       value="solucao" data-id="${item.id_material}" ${item.formato === 'solucao' ? 'checked' : ''}>
                                <label class="form-check-label small" for="formato-solucao-${context}-${item.id_material}">Solução</label>
                            </div>
                        </div>
                    `;
                }

                return `
                <div class="list-group-item d-flex justify-content-between align-items-start py-2">
                    <div class="me-2 flex-grow-1">
                        <strong class="d-block">${item.nome}</strong>
                        <div class="d-flex align-items-center mt-1">
                            <label for="qtd-${context}-${item.id_material}" class="form-label me-2 small mb-0 text-nowrap">Qtd:</label>
                            <input type="number" id="qtd-${context}-${item.id_material}" 
                                   class="form-control form-control-sm input-qtd-material" 
                                   style="width: 80px;" value="${item.quantidade}" min="1" 
                                   data-id="${item.id_material}">
                            <span class="ms-2 text-muted small">${item.unidade}</span>
                        </div>
                        ${formatoHtml}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger btn-remove-material" data-id="${item.id_material}">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                `;
            }).join('');
        }
        
        // Adiciona um item à lista de selecionados
        function addItem(id) {
            const item = appState.materiais.find(m => m.id == id);
            if (item) {
                selectedItems.push({
                    id_material: item.id, // ID aqui é 'id' (do material)
                    nome: item.nome,
                    quantidade: 1,
                    unidade: item.unidade,
                    tipo_material: item.tipo_material,
                    formato: 'solido' // (Tarefa 4) - Padrão
                });
                renderDisponiveis();
                renderSelecionados();
            }
        }

        // Remove um item da lista de selecionados
        function removeItem(id) {
            selectedItems = selectedItems.filter(item => item.id_material != id);
            renderDisponiveis();
            renderSelecionados();
        }

        // Atualiza um campo de um item (qtd ou formato)
        function updateItem(id, campo, valor) {
            const item = selectedItems.find(item => item.id_material == id);
            if (item) {
                item[campo] = valor;
            }
        }
        
        // Carrega uma lista de itens (ex: de um kit)
        function loadFromKit(kitItems) {
            if (!kitItems) {
                selectedItems = [];
            } else {
                 selectedItems = kitItems.map(item => ({
                    id_material: item.id, // AQUI: o kit retorna 'id', o Agendamento retorna 'id_material'
                    nome: item.nome,
                    quantidade: item.quantidade || item.quantidade_no_kit, // Usa quantidade do kit se houver
                    unidade: item.unidade,
                    tipo_material: item.tipo_material,
                    formato: item.formato || 'solido'
                }));
            }
            renderDisponiveis();
            renderSelecionados();
        }

        // Retorna a lista de itens (Padronizado para envio ao Backend)
        function getSelectedItems() {
             // Garante que o objeto enviado ao backend tenha a estrutura correta (id_material)
            return selectedItems.map(item => ({
                id_material: item.id_material,
                quantidade: item.quantidade,
                formato: item.formato
            }));
        }
        
        // NOVO: Expõe o renderDisponiveis para o auto-refresh
        return { init, getSelectedItems, loadFromKit, renderDisponiveis };
    }

    // (Tarefas 1 e 4) - Inicializa os 3 seletores
    function inicializarSeletoresDeMateriais() {
        agendamentoSelector = createMaterialSelector('Agendamento');
        novoKitSelector = createMaterialSelector('Kit');
        editKitSelector = createMaterialSelector('EditKit');

        // Inicia os seletores dos modais (o do agendamento é iniciado no renderFormulario)
        agendamentoSelector.init();
        novoKitSelector.init();
        editKitSelector.init();
    }


    // --- LÓGICA DE NAVEGAÇÃO E MODAIS (Ações) ---
    function iniciarListenersGlobais() {
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
        const cardNovoAgendamento = document.getElementById("acao-novo-agendamento");
        const abaNovoAgendamento = document.querySelector(".nav-link[data-target='novo-agendamento']");
        if (cardNovoAgendamento && abaNovoAgendamento) {
            cardNovoAgendamento.addEventListener("click", (e) => { e.preventDefault(); abaNovoAgendamento.click(); });
        }
        const cardCriarKit = document.getElementById("acao-criar-kit");
        const abaMeusKits = document.querySelector('.nav-link[data-target="meus-kits"]');
        if (cardCriarKit && abaMeusKits) {
            cardCriarKit.addEventListener('click', (e) => { e.preventDefault(); abaMeusKits.click(); abrirModalKit(null); });
        }
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
        if (localStorage.getItem('darkMode') === 'true') {
            body.classList.add('dark-mode');
        }
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
        const modalConfirmarSaida = document.getElementById("modalConfirmarSaida");
        const btnFecharModalSaida = document.getElementById("fecharModalSaidaBtn");
        const btnCancelarSaida = document.getElementById("cancelarSaidaBtn");
        const btnConfirmarSaida = document.getElementById("confirmarSaidaBtn");
        const botaoSair = document.getElementById('botaoSair');
        function abrirModalSaida() { if (modalConfirmarSaida) modalConfirmarSaida.classList.add("visivel"); }
        function fecharModalSaida() { if (modalConfirmarSaida) modalConfirmarSaida.classList.remove("visivel"); }
        if(botaoSair) botaoSair.addEventListener("click", abrirModalSaida);
        if (btnFecharModalSaida) btnFecharModalSaida.addEventListener("click", fecharModalSaida);
        if (btnCancelarSaida) btnCancelarSaida.addEventListener("click", fecharModalSaida);
        if (btnConfirmarSaida) {
            btnConfirmarSaida.addEventListener("click", () => {
                localStorage.clear();
                window.location.href = 'telaLogin.html';
            });
        }
        adicionarCliqueFora(modalConfirmarSaida, fecharModalSaida);
    }
    
    // --- LÓGICA DE FORMULÁRIOS (ATUALIZADA - Tarefas 1 e 4) ---
    function iniciarListenersFormularios() {

        // (Tarefas 1 e 4) - Listener do dropdown de kit (para preencher o seletor)
        const kitSelect = document.getElementById('select-kit-existente');
        if (kitSelect) {
            kitSelect.addEventListener('change', (e) => {
                const kitId = e.target.value;
                if (!kitId) {
                    agendamentoSelector.loadFromKit([]); // Limpa a lista
                    return;
                }
                const kit = appState.kits.find(k => k.id == kitId);
                if (kit) {
                    agendamentoSelector.loadFromKit(kit.materiais); // Carrega os itens do kit
                }
            });
        }

        // (Tarefas 1 e 4) - ATUALIZADO: Submit do Novo Agendamento
        const formNovoAgendamento = document.getElementById('formNovoAgendamento');
        const btnConfirmarAgendamento = formNovoAgendamento ? formNovoAgendamento.querySelector('.btn-custom-confirmar') : null;

        if (formNovoAgendamento) {
            formNovoAgendamento.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const materiais_selecionados = agendamentoSelector.getSelectedItems(); 
                if (materiais_selecionados.length === 0) {
                     showAlert('Por favor, selecione pelo menos um material.', 'Erro', 'error');
                    return;
                }
                
                const data = document.getElementById('data').value;
                const inicio = document.getElementById('horario-inicio').value;
                const fim = document.getElementById('horario-fim').value;
                const laboratorioRadio = document.querySelector('input[name="laboratorio"]:checked');
                
                if (!laboratorioRadio) {
                    showAlert('Por favor, selecione um laboratório.', 'Erro', 'error');
                    return;
                }
                
                const fk_kit = document.getElementById('select-kit-existente').value; 
                
                const agendamento = {
                    data_hora_inicio: `${data}T${inicio}:00`,
                    data_hora_fim: `${data}T${fim}:00`,
                    fk_laboratorio: laboratorioRadio.value,
                    observacoes: document.getElementById('observacoes').value,
                    fk_kit: fk_kit || null, // Se vazio, envia null
                    materiais_selecionados: materiais_selecionados, 
                };

                // Feedback visual do botão
                if (btnConfirmarAgendamento) {
                    btnConfirmarAgendamento.disabled = true;
                    btnConfirmarAgendamento.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Processando...';
                }

                try {
                    await window.apiService.createAgendamento(agendamento);
                    showAlert('Agendamento criado com sucesso! Aguardando confirmação.', 'Sucesso', 'success');
                    // Reinicia a tela para atualizar o dashboard/listas
                    location.reload(); 
                } catch (error) {
                    console.error("Erro ao criar agendamento:", error);
                    showAlert(error.message, "Erro", "error");
                } finally {
                     // Restaura o botão em caso de erro
                    if (btnConfirmarAgendamento) {
                         btnConfirmarAgendamento.disabled = false;
                         btnConfirmarAgendamento.innerHTML = 'Confirmar Agendamento';
                    }
                }
            });
        }

        // (Tarefas 1 e 4) - ATUALIZADO: Submit do Novo Kit
        const formNovoKit = document.getElementById("formNovoKit");
        const btnSalvarKit = formNovoKit ? formNovoKit.querySelector('.btn-success') : null;

        if (formNovoKit) formNovoKit.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const materiais_kit = novoKitSelector.getSelectedItems();
            if (materiais_kit.length === 0) {
                 showAlert('Por favor, adicione pelo menos um material ao kit.', 'Erro', 'error');
                 return;
            }
            
            const novoKit = {
                nome_kit: document.getElementById('kit-nome').value,
                materiais_kit: materiais_kit // Envia a lista de materiais
            };
            
            // Feedback visual do botão
            if (btnSalvarKit) {
                btnSalvarKit.disabled = true;
                btnSalvarKit.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Salvando...';
            }

            try {
                await window.apiService.createKit(novoKit);
                // Fecha o modal antes de recarregar
                fecharModalKit(); 
                showAlert('Kit criado com sucesso!', 'Sucesso', 'success');
                location.reload(); 
            } catch (error) {
                 console.error("Erro ao criar kit:", error);
                 showAlert(error.message, "Erro", "error");
            } finally {
                // Restaura o botão em caso de erro
                if (btnSalvarKit) {
                    btnSalvarKit.disabled = false;
                    btnSalvarKit.innerHTML = 'Salvar Kit';
                }
            }
        });
        
        // (Tarefas 1 e 4) - ATUALIZADO: Submit do Editar Kit
        const formEditarKit = document.getElementById("formEditarKit");
        const btnSalvarEdicaoKit = formEditarKit ? formEditarKit.querySelector('.btn-success') : null;
        
        if (formEditarKit) formEditarKit.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const materiais_kit = editKitSelector.getSelectedItems();
            if (materiais_kit.length === 0) {
                 showAlert('Por favor, adicione pelo menos um material ao kit.', 'Erro', 'error');
                 return;
            }
            
            const id = document.getElementById('edit-kit-id').value;
            const kitAtualizado = {
                nome_kit: document.getElementById('edit-kit-nome').value,
                materiais_kit: materiais_kit // Envia a lista de materiais
            };
            
            // Feedback visual do botão
            if (btnSalvarEdicaoKit) {
                btnSalvarEdicaoKit.disabled = true;
                btnSalvarEdicaoKit.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Salvando...';
            }

            try {
                await window.apiService.updateKit(id, kitAtualizado);
                // Fecha o modal antes de recarregar
                fecharModalEditarKit();
                showAlert('Kit atualizado com sucesso!', 'Sucesso', 'success');
                location.reload();
            } catch (error) {
                 console.error("Erro ao atualizar kit:", error);
                 showAlert(error.message, "Erro", "error");
            } finally {
                 // Restaura o botão em caso de erro
                if (btnSalvarEdicaoKit) {
                    btnSalvarEdicaoKit.disabled = false;
                    btnSalvarEdicaoKit.innerHTML = 'Salvar Alterações';
                }
            }
        });
    } 

    // --- Lógica de Modais (ATUALIZADA - Tarefas 1 e 4) ---
    function adicionarCliqueFora(modalElement, fecharFn) {
        if (modalElement) {
            modalElement.addEventListener('click', (event) => {
                if (event.target === modalElement) {
                    fecharFn();
                }
            });
        }
    }
    const modalNovoKit = document.getElementById("modalNovoKit");
    const botaoAbrirModalKit = document.getElementById("abrirModalKitBtn");
    const botaoFecharModalKit = document.getElementById("fecharModalKitBtn");
    const botaoCancelarModalKit = document.getElementById("cancelarModalKitBtn");
    const formNovoKitRef = document.getElementById("formNovoKit"); 
    function abrirModalKit() { 
        if (modalNovoKit) modalNovoKit.classList.add("visivel"); 
        novoKitSelector.loadFromKit([]); // Limpa o seletor ao abrir
    }
    function fecharModalKit() { if (modalNovoKit) modalNovoKit.classList.remove("visivel"); if(formNovoKitRef) formNovoKitRef.reset(); }
    if (botaoAbrirModalKit) botaoAbrirModalKit.addEventListener("click", abrirModalKit);
    if (botaoFecharModalKit) botaoFecharModalKit.addEventListener("click", fecharModalKit);
    if (botaoCancelarModalKit) botaoCancelarModalKit.addEventListener("click", fecharModalKit);
    adicionarCliqueFora(modalNovoKit, fecharModalKit);

    const modalVerDetalhes = document.getElementById("modalVerDetalhes");
    const btnFecharModalVerDetalhes = document.getElementById("fecharModalVerDetalhesBtn");
    const btnFecharModalFooter = document.getElementById("fecharModalVerDetalhesBtn_footer");
    function fecharModalVerDetalhes() { if (modalVerDetalhes) modalVerDetalhes.classList.remove("visivel"); }
    if (btnFecharModalVerDetalhes) btnFecharModalVerDetalhes.addEventListener("click", fecharModalVerDetalhes);
    if (btnFecharModalFooter) btnFecharModalFooter.addEventListener("click", fecharModalVerDetalhes);
    adicionarCliqueFora(modalVerDetalhes, fecharModalVerDetalhes);
    function abrirModalVerDetalhes(id) {
        const aula = appState.agendamentos.find(a => a.id_agendamento == id);
        if (!aula) return;
        document.getElementById('detalhe-titulo-val').innerText = aula.observacoes || 'Aula experimental'; // ID corrigido
        document.getElementById('detalhe-status').innerHTML = `<span class="status-texto status-${aula.status_agendamento}">${aula.status_agendamento}</span>`;
        document.getElementById('detalhe-turma').innerText = 'N/A';
        document.getElementById('detalhe-alunos').innerText = 'N/A';
        document.getElementById('detalhe-lab').innerText = aula.nome_laboratorio || 'N/A';
        document.getElementById('detalhe-data').innerText = `${formatarData(aula.data_hora_inicio)} ${formatarHorario(aula.data_hora_inicio)}-${formatarHorario(aula.data_hora_fim)}`;
        document.getElementById('detalhe-kit').innerText = aula.nome_kit || 'Nenhum';
        document.getElementById('detalhe-obs').innerText = aula.observacoes || 'Nenhuma.';
        if (modalVerDetalhes) modalVerDetalhes.classList.add("visivel");
    }
    
    const modalEditarAula = document.getElementById("modalEditarAula");
    const btnFecharModalEditarAula = document.getElementById("fecharModalEditarAulaBtn");
    const btnCancelarModalEditarAula = document.getElementById("cancelarModalEditarAulaBtn");
    function fecharModalEditarAula() { if (modalEditarAula) modalEditarAula.classList.remove("visivel"); }
    if (btnFecharModalEditarAula) btnFecharModalEditarAula.addEventListener("click", fecharModalEditarAula);
    if (btnCancelarModalEditarAula) btnCancelarModalEditarAula.addEventListener("click", fecharModalEditarAula);
    adicionarCliqueFora(modalEditarAula, fecharModalEditarAula);

    const modalVerKit = document.getElementById("modalVerKit");
    const btnFecharModalVerKit = document.getElementById("fecharModalVerKitBtn");
    const btnFecharModalKitFooter = document.getElementById("fecharModalVerKitBtn_footer");
    function fecharModalVerKit() { if (modalVerKit) modalVerKit.classList.remove("visivel"); }
    if (btnFecharModalVerKit) btnFecharModalVerKit.addEventListener("click", fecharModalVerKit);
    if (btnFecharModalKitFooter) btnFecharModalKitFooter.addEventListener("click", fecharModalVerKit);
    adicionarCliqueFora(modalVerKit, fecharModalVerKit);
    
    // ATUALIZADO (Tarefas 1 e 4): Renderiza a lista de materiais
    function abrirModalVerKit(id) {
        const kit = appState.kits.find(k => k.id == id);
        if (!kit) return;
        document.getElementById('detalhe-kit-titulo').innerText = kit.nome_kit;
        
        // Renderiza a lista de itens
        const descricaoItens = kit.materiais && kit.materiais.length > 0
            ? kit.materiais.map(m => `- ${m.quantidade} ${m.unidade || ''} de ${m.nome} (${m.formato})`).join('\n')
            : 'Kit vazio.';
        document.getElementById('detalhe-kit-itens').innerText = descricaoItens;
        
        document.getElementById('detalhe-kit-uso').innerText = 'Em desenvolvimento.';
        if (modalVerKit) modalVerKit.classList.add("visivel");
    }

    const modalEditarKit = document.getElementById("modalEditarKit");
    const btnFecharModalEditarKit = document.getElementById("fecharModalEditarKitBtn");
    const btnCancelarModalEditarKit = document.getElementById("cancelarModalEditarKitBtn");
    const formEditarKitRef = document.getElementById("formEditarKit");
    function fecharModalEditarKit() { if (modalEditarKit) modalEditarKit.classList.remove("visivel"); if(formEditarKitRef) formEditarKitRef.reset(); }
    if (btnFecharModalEditarKit) btnFecharModalEditarKit.addEventListener("click", fecharModalEditarKit);
    if (btnCancelarModalEditarKit) btnCancelarModalEditarKit.addEventListener("click", fecharModalEditarKit);
    adicionarCliqueFora(modalEditarKit, fecharModalEditarKit);
    
    // ATUALIZADO (Tarefas 1 e 4): Carrega os itens do kit no seletor
    function abrirModalEditarKit(id) {
        const kit = appState.kits.find(k => k.id == id);
        if (!kit) return;
        document.getElementById('edit-kit-id').value = kit.id;
        document.getElementById('edit-kit-nome').value = kit.nome_kit;
        
        // Carrega os itens do kit no seletor
        editKitSelector.loadFromKit(kit.materiais);
        
        if (modalEditarKit) modalEditarKit.classList.add("visivel");
    }

    // --- NOVA LÓGICA PARA O BOTÃO "ÚLTIMO AGENDAMENTO" ---
    function configurarBotaoUltimoAgendamento() {
        const botaoUltimoAgendamento = document.getElementById('acao-ultimo-agendamento');
        if (!botaoUltimoAgendamento) return;
        const agora = new Date();
        const agendamentosPassados = appState.agendamentos
            .filter(a => new Date(a.data_hora_inicio) <= agora)
            .sort((a, b) => new Date(b.data_hora_inicio) - new Date(a.data_hora_inicio));
        const ultimoAgendamento = agendamentosPassados[0];
        if (ultimoAgendamento) {
            botaoUltimoAgendamento.addEventListener('click', (e) => {
                e.preventDefault();
                abrirModalUltimoAgendamento(ultimoAgendamento);
            });
        } else {
            const titulo = botaoUltimoAgendamento.querySelector('.titulo');
            const subtitulo = botaoUltimoAgendamento.querySelector('.subtitulo');
            if (titulo) titulo.textContent = 'Novo Agendamento';
            if (subtitulo) subtitulo.textContent = 'Clique para criar seu primeiro agendamento';
            botaoUltimoAgendamento.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector('.nav-link[data-target="novo-agendamento"]').click();
            });
        }
    }

    const modalUltimoAgendamento = document.getElementById("modalUltimoAgendamento");
    const btnFecharModalUltimoAgendamento = document.getElementById("fecharModalUltimoAgendamentoBtn");
    const btnFecharModalUltimoFooter = document.getElementById("fecharModalUltimoAgendamentoBtn_footer");
    function fecharModalUltimoAgendamento() {
        if (modalUltimoAgendamento) modalUltimoAgendamento.classList.remove("visivel");
    }
    if (btnFecharModalUltimoAgendamento) btnFecharModalUltimoAgendamento.addEventListener("click", fecharModalUltimoAgendamento);
    if (btnFecharModalUltimoFooter) btnFecharModalUltimoFooter.addEventListener("click", fecharModalUltimoAgendamento);
    adicionarCliqueFora(modalUltimoAgendamento, fecharModalUltimoAgendamento);

    function abrirModalUltimoAgendamento(aula) {
        if (!aula) return;
        document.getElementById('ultimo-agendamento-titulo').innerText = aula.observacoes || 'Aula experimental';
        document.getElementById('ultimo-agendamento-lab').innerText = aula.nome_laboratorio || 'N/A';
        document.getElementById('ultimo-agendamento-data').innerText = `${formatarData(aula.data_hora_inicio)} ${formatarHorario(aula.data_hora_inicio)}-${formatarHorario(aula.data_hora_fim)}`;
        document.getElementById('ultimo-agendamento-kit').innerText = aula.nome_kit || 'Nenhum';
        document.getElementById('ultimo-agendamento-obs').innerText = aula.observacoes || 'Nenhuma.';
        if (modalUltimoAgendamento) modalUltimoAgendamento.classList.add("visivel");
    }

    // --- Listeners de Eventos Dinâmicos (usando window.apiService) ---
    function iniciarListenersDinamicos() {
        document.getElementById('lista-proximas-aulas').addEventListener('click', async (e) => {
            const target = e.target.closest('button'); 
            if (!target) return;
            const id = target.dataset.id;
            if (!id) return;

            // Variável para restaurar o estado do botão (apenas para o cancelar)
            const originalText = target.innerHTML;
            const isCancelButton = target.classList.contains('btn-cancelar-aula');

            if (target.classList.contains('btn-ver-detalhes')) {
                abrirModalVerDetalhes(id);
            }
            
            if (isCancelButton) {
                target.disabled = true;
                target.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Cancelando...';
                try {
                    await window.apiService.cancelarAgendamentoProfessor(id);
                    showAlert('Agendamento cancelado.', 'Aviso', 'warning');
                    location.reload();
                } catch (error) {
                    showAlert(error.message, 'Erro', 'error');
                } finally {
                    target.disabled = false;
                    target.innerHTML = originalText;
                }
            }
        });
        
        document.getElementById('lista-meus-kits').addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;
            const id = target.dataset.id;
            if (!id) return;
            
            if (target.classList.contains('btn-ver-kit')) {
                abrirModalVerKit(id);
            }
            if (target.classList.contains('btn-editar-kit')) {
                abrirModalEditarKit(id);
            }
            if (target.classList.contains('btn-excluir-kit')) {
                 // Adicionado feedback visual para o botão de exclusão
                 const originalText = target.innerHTML;
                 target.disabled = true;
                 target.innerHTML = '<i class="bi bi-trash-fill"></i> Excluindo...';
                 
                 try {
                    // TODO: Idealmente, usar um modal de confirmação antes de chamar a API
                    await window.apiService.deleteKit(id);
                    showAlert('Kit excluído com sucesso.', 'Sucesso', 'success');
                    location.reload();
                } catch (error) {
                    showAlert(error.message, 'Erro', 'error');
                } finally {
                    target.disabled = false;
                    target.innerHTML = originalText;
                }
            }
        });
    } 

    // --- FUNÇÕES AUXILIARES ---
    function showAlert(message, title = "Notificação", type = "info") {
        if (!globalToast) {
            console.log(`[Alerta: ${title}] ${message}`);
            return;
        }
        const toastTitle = document.getElementById('toastTitle');
        const toastBody = document.getElementById('toastBody');
        const toastIconContainer = toastTitle.querySelector('i');
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
        if (toastIconContainer) {
            toastIconContainer.className = `bi ${iconClass} me-2`;
        }
        if (toastTitle.childNodes[1]) {
            toastTitle.childNodes[1].nodeValue = ` ${title}`;
        } else {
            toastTitle.appendChild(document.createTextNode(` ${title}`));
        }
        toastBody.innerText = message;
        globalToast.show();
    }
    function getStatusIcone(status) {
        switch (status) {
            case 'confirmado': return '✅';
            case 'pendente': return '⌛';
            case 'cancelado': return '❌';
            case 'concluido': return '✔️';
            default: return '?';
        }
    }
    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        try {
            const dataObj = new Date(dataString);
            const dia = String(dataObj.getUTCDate()).padStart(2, '0');
            const mes = String(dataObj.getUTCMonth() + 1).padStart(2, '0');
            const ano = dataObj.getUTCFullYear();
            return `${dia}/${mes}/${ano}`;
        } catch(e) {
            return dataString.split('T')[0];
        }
    }
    function formatarHorario(dataString) {
        if (!dataString) return 'N/A';
        try {
            const dataObj = new Date(dataString);
            const horas = String(dataObj.getUTCHours()).padStart(2, '0');
            const minutos = String(dataObj.getUTCMinutes()).padStart(2, '0');
            return `${horas}:${minutos}`;
        } catch(e) {
            return '00:00';
        }
    }
});