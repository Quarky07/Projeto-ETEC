document.addEventListener("DOMContentLoaded", function () {

    // --- VARIÁVEIS GLOBAIS ---
    let appState = {
        userId: null,
        userName: "Técnico",
        userType: "tecnico",
        token: null,
        agendamentosPendentes: [],
        materiais: [], // Fonte de dados principal para o estoque
        agendamentosHistorico: []
    };

    // Timer para refresh automático
    const REFRESH_INTERVAL_MS = 15000;
    let refreshTimer;

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
    if (checkLogin()) {
        iniciarCarregamentoDados();
        iniciarListeners();
        iniciarRefreshAutomatico(); // NOVO: Inicia o refresh
    }
    
    // --- Funções de Refresh ---
    function iniciarRefreshAutomatico() {
        if (refreshTimer) clearInterval(refreshTimer); 
        
        refreshTimer = setInterval(() => {
            console.log(`[Técnico Refresh] Recarregando dados em background (${new Date().toLocaleTimeString()})...`);
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

        if (!appState.userId || !appState.userType || appState.userType !== 'tecnico' || !appState.token) {
            console.warn("Acesso não autorizado ou token inválido. Redirecionando para login.");
            localStorage.clear();
            window.location.href = 'telaLogin.html';
            return false; 
        }

        document.getElementById('nome-usuario').innerText = appState.userName;
        document.getElementById('tipo-usuario').innerText = appState.userType;
        return true; 
    }

    // --- CARREGAMENTO DE DADOS (usando window.apiService) ---
    async function iniciarCarregamentoDados(silencioso = false) {
        try {
            const [pendentes, materiais, historico] = await Promise.all([
                window.apiService.getAgendamentosPendentes(),
                window.apiService.getMateriais(),
                window.apiService.getHistorico()
            ]);
            
            appState.agendamentosPendentes = pendentes;
            appState.materiais = materiais; // Lista completa de materiais
            appState.agendamentosHistorico = historico;
            
            // Renderizar
            renderAgendamentosPendentes();
            renderEstoque(); // Renderiza a lista completa (agora filtrável)
            renderHistorico();

        } catch (error) {
             console.error("Erro fatal ao carregar dados:", error);
            if (!error.message.includes("expirou") && !silencioso) {
                showAlert(error.message, "Erro de Conexão", "error");
            }
            document.getElementById('lista-agendamentos-tbody').innerHTML = `<tr><td colspan="6" data-label="Erro" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
            // ATUALIZADO: Colspan
            document.getElementById('lista-estoque-tbody').innerHTML = `<tr><td colspan="6" data-label="Erro" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
            document.getElementById('lista-historico-tbody').innerHTML = `<tr><td colspan="4" data-label="Erro" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
        }
    }
    
    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function renderAgendamentosPendentes() {
        const tbody = document.getElementById('lista-agendamentos-tbody');
        if (appState.agendamentosPendentes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" data-label="Aviso" class="text-center">Nenhum agendamento pendente.</td></tr>`;
            return;
        }
        tbody.innerHTML = appState.agendamentosPendentes.map(aula => `
            <tr data-id="${aula.id_agendamento}">
                <td data-label="Professor">${aula.nome_professor || 'N/A'}</td>
                <td data-label="Data">${formatarData(aula.data_hora_inicio)}</td>
                <td data-label="Horário">${formatarHorario(aula.data_hora_inicio)} - ${formatarHorario(aula.data_hora_fim)}</td>
                <td data-label="Laboratório">${aula.nome_laboratorio || 'N/A'}</td>
                <td data-label="Kit">${aula.nome_kit || 'Nenhum'}</td>
                <td data-label="Ações" class="text-center acoes-cell">
                    <button class="btn btn-sm btn-outline-primary mx-1 btn-analisar-agendamento" data-id="${aula.id_agendamento}">Analisar</button>
                </td>
            </tr>
        `).join('');
    }

    // ATUALIZADO: Adicionado botão de excluir
    function renderEstoque() {
        const tbody = document.getElementById('lista-estoque-tbody');
        
        const filtroInput = document.getElementById('filtroEstoque');
        const filtroTexto = filtroInput ? filtroInput.value.toLowerCase() : '';

        const materiaisFiltrados = appState.materiais.filter(item => {
            return item.nome.toLowerCase().includes(filtroTexto) ||
                   (item.descricao && item.descricao.toLowerCase().includes(filtroTexto)) ||
                   (item.localizacao && item.localizacao.toLowerCase().includes(filtroTexto));
        });

        if (materiaisFiltrados.length === 0) {
             // ATUALIZADO: Colspan
             if (filtroTexto) {
                tbody.innerHTML = `<tr><td colspan="6" data-label="Aviso" class="text-center">Nenhum item encontrado para "${filtroTexto}".</td></tr>`;
            } else {
                tbody.innerHTML = `<tr><td colspan="6" data-label="Aviso" class="text-center">Nenhum item no estoque.</td></tr>`;
            }
            return;
        }
        
        // ATUALIZADO: Adicionado <td> de Ações com botão excluir
        tbody.innerHTML = materiaisFiltrados.map(item => `
            <tr data-id="${item.id}">
                <td data-label="Item">${item.nome}</td>
                <td data-label="Descrição">${item.descricao || 'N/A'}</td>
                <td data-label="Tipo">${item.tipo_material} (${item.classificacao})</td>
                <td data-label="Quantidade" class="text-center mobile-center">${item.quantidade} ${item.unidade}</td>
                <td data-label="Localização">${item.localizacao || 'N/A'}</td>
                <td data-label="Ações" class="text-center acoes-cell">
                    <button class="btn btn-sm btn-outline-danger btn-excluir-item" data-id="${item.id}" title="Excluir item">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderHistorico() {
        const tbody = document.getElementById('lista-historico-tbody');
        if (appState.agendamentosHistorico.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" data-label="Aviso" class="text-center">Nenhum histórico de agendamentos.</td></tr>`;
            return;
        }
        tbody.innerHTML = appState.agendamentosHistorico.map(aula => `
            <tr data-id="${aula.id_agendamento}">
                <td data-label="Professor">${aula.nome_professor || 'N/A'}</td>
                <td data-label="Data">${formatarData(aula.data_hora_inicio)}</td>
                <td data-label="Laboratório">${aula.nome_laboratorio || 'N/A'}</td>
                <td data-label="Status" class="text-center mobile-center">
                    <span class="badge ${getStatusInfo(aula.status_agendamento).statusClasse}">
                        ${getStatusInfo(aula.status_agendamento).statusTexto}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    // --- LÓGICA DE EVENTOS E MODAIS (usando window.apiService) ---
    function iniciarListeners() {
        
        // --- Navegação ---
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
        
        // ADICIONADO DE VOLTA: Centralizando a inicialização do VLibras aqui.
        if (window.VLibras) {
            new window.VLibras.Widget('https://vlibras.gov.br/app');
        }
        

        // --- Modal Saída ---
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
        
        // --- Modal Adicionar Item Estoque ---
        const itemModal = document.getElementById("itemModal");
        const btnAdicionar = document.getElementById("abrirModalItemBtn");
        const btnFechar = document.getElementById("fecharModalItemBtn");
        const btnCancelar = document.getElementById("cancelarModalItemBtn");
        const formItem = document.getElementById("formItem");
        const btnSalvarItem = formItem ? formItem.querySelector('.btn-success') : null;

        function abrirModalItem() { if (itemModal) itemModal.classList.add("visivel"); }
        function fecharModalItem() { if (itemModal) itemModal.classList.remove("visivel"); formItem.reset(); }
        if (btnAdicionar) btnAdicionar.addEventListener("click", abrirModalItem);
        if (btnFechar) btnFechar.addEventListener("click", fecharModalItem);
        if (btnCancelar) btnCancelar.addEventListener("click", fecharModalItem);
        adicionarCliqueFora(itemModal, fecharModalItem);
        
        if (formItem) {
            formItem.addEventListener("submit", async function (e) {
                e.preventDefault();
                
                const novoItem = {
                    nome: document.getElementById("itemNome").value,
                    descricao: document.getElementById("itemDesc").value,
                    localizacao: document.getElementById("itemLocal").value,
                    tipo_material: document.getElementById('itemTipoMaterial').value, 
                    classificacao: document.getElementById('itemClassificacao').value,
                    quantidade: parseFloat(document.getElementById('itemQuantidade').value),
                    unidade: document.getElementById('itemUnidade').value
                };

                if (btnSalvarItem) {
                    btnSalvarItem.disabled = true;
                    btnSalvarItem.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Salvando...';
                }
                
                try {
                    const data = await window.apiService.createMaterial(novoItem);
                    // Fecha o modal antes de recarregar
                    fecharModalItem();
                    showAlert(`Item "${data.nome}" cadastrado com sucesso!`, "Sucesso", "success");
                    location.reload(); // Recarrega para pegar o item novo e o log
                } catch (error) {
                    console.error("Erro ao cadastrar item:", error);
                    showAlert(error.message, "Erro", "error");
                } finally {
                    if (btnSalvarItem) {
                        btnSalvarItem.disabled = false;
                        btnSalvarItem.innerHTML = 'Adicionar';
                    }
                }
            });
        }

        // --- Modal Analisar Agendamento ---
        const analisarModal = document.getElementById("analisarModal");
        const btnFecharAnalisar = document.getElementById("fecharModalAnalisarBtn");
        const btnConfirmarAnalise = document.getElementById("btnConfirmarAnalise");
        const btnCancelarAnalise = document.getElementById("btnCancelarAnalise");
        function fecharModalAnalisar() { if (analisarModal) analisarModal.classList.remove("visivel"); }
        if (btnFecharAnalisar) btnFecharAnalisar.addEventListener("click", fecharModalAnalisar);
        adicionarCliqueFora(analisarModal, fecharModalAnalisar);
        
        if (btnConfirmarAnalise) btnConfirmarAnalise.addEventListener('click', () => handleAnalise(btnConfirmarAnalise.dataset.id, 'confirmado'));
        if (btnCancelarAnalise) btnCancelarAnalise.addEventListener('click', () => handleAnalise(btnCancelarAnalise.dataset.id, 'cancelado'));
        
        async function handleAnalise(id, status) {
            
            const isConfirm = status === 'confirmado';
            const btnTarget = isConfirm ? btnConfirmarAnalise : btnCancelarAnalise;
            const btnOpposite = isConfirm ? btnCancelarAnalise : btnConfirmarAnalise;
            const originalText = btnTarget.innerHTML;
            
            // Desabilita ambos os botões durante o processamento
            btnTarget.disabled = true;
            btnOpposite.disabled = true;

            btnTarget.innerHTML = `<i class="bi bi-hourglass-split me-2"></i>${isConfirm ? 'Confirmando...' : 'Cancelando...'}`;
            
            let pesos_solucao = [];
            
            if (isConfirm) {
                const formPreparo = document.getElementById('formPreparoSolucoes');
                // Verifica a validação do formulário (campos required)
                if (!formPreparo.checkValidity()) {
                    showAlert('Por favor, preencha o peso(g) de todos os reagentes em solução.', 'Erro', 'error');
                    formPreparo.reportValidity();
                    // Restaura apenas o texto do botão, mantém desabilitado até o finally
                    btnTarget.innerHTML = originalText;
                    // Reativa os botões
                    btnTarget.disabled = false;
                    btnOpposite.disabled = false;
                    return;
                }
                
                const inputsPeso = formPreparo.querySelectorAll('input[data-item-id]');
                inputsPeso.forEach(input => {
                    pesos_solucao.push({
                        id_material: input.dataset.itemId,
                        peso: parseFloat(input.value)
                    });
                });
            }

            try {
                await window.apiService.updateStatusAgendamento(id, status, pesos_solucao);
                // Fecha o modal antes de recarregar
                fecharModalAnalisar();
                showAlert(`Agendamento ${status} com sucesso!`, 'Sucesso', 'success');
                location.reload();
            } catch (error) {
                showAlert(error.message, 'Erro', 'error');
            } finally {
                // Restaura o estado original de ambos os botões em caso de erro
                btnConfirmarAnalise.disabled = false;
                btnCancelarAnalise.disabled = false;
                btnConfirmarAnalise.innerHTML = '<i class="bi bi-check-lg me-2"></i>Confirmar';
                btnCancelarAnalise.innerHTML = '<i class="bi bi-x-lg me-2"></i>Cancelar';
            }
        }

        // ADICIONADO: Listener do filtro de estoque
        const filtroEstoqueInput = document.getElementById('filtroEstoque');
        if (filtroEstoqueInput) {
            filtroEstoqueInput.addEventListener('input', () => {
                renderEstoque(); // Re-renderiza a lista a cada digitação
            });
        }

        // ADICIONADO: Listener do botão Desfazer
        const btnDesfazer = document.getElementById('btnDesfazerEstoque');
        if (btnDesfazer) {
            btnDesfazer.addEventListener('click', async () => {
                // TODO: Adicionar um modal de confirmação "Tem certeza?"
                try {
                    btnDesfazer.disabled = true;
                    btnDesfazer.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Desfazendo...';
                    
                    await window.apiService.undoEstoqueChange();
                    
                    showAlert('Última alteração de estoque desfeita com sucesso!', 'Sucesso', 'success');
                    setTimeout(() => location.reload(), 1500); 
                    
                } catch (error) {
                    console.error("Erro ao desfazer:", error);
                    showAlert(error.message, "Erro", "error");
                    btnDesfazer.disabled = false;
                    btnDesfazer.innerHTML = '<i class="bi bi-arrow-counterclockwise me-2"></i>Desfazer';
                }
            });
        }
        
        // --- Ações Dinâmicas (Delegação de Eventos) ---
        document.getElementById('lista-agendamentos-tbody').addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (target && target.classList.contains('btn-analisar-agendamento')) {
                const id = target.dataset.id;
                abrirModalAnalisar(id);
            }
        });
        
        // ADICIONADO: Listener para exclusão de item do estoque
        document.getElementById('lista-estoque-tbody').addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (target && target.classList.contains('btn-excluir-item')) {
                const id = target.dataset.id;
                abrirModalConfirmarExclusao(id); // Chama o novo modal
            }
        });
        
        // ADICIONADO: Listeners para o novo modal de exclusão
        const modalExcluir = document.getElementById("modalConfirmarExclusaoItem");
        const btnFecharModalExcluir = document.getElementById("fecharModalExcluirItemBtn");
        const btnCancelarModalExcluir = document.getElementById("cancelarExcluirItemBtn");
        const btnConfirmarModalExcluir = document.getElementById("confirmarExcluirItemBtn");

        function fecharModalExcluir() { if (modalExcluir) modalExcluir.classList.remove("visivel"); }
        
        if(btnFecharModalExcluir) btnFecharModalExcluir.addEventListener("click", fecharModalExcluir);
        if(btnCancelarModalExcluir) btnCancelarModalExcluir.addEventListener("click", fecharModalExcluir);
        adicionarCliqueFora(modalExcluir, fecharModalExcluir);
        
        if (btnConfirmarModalExcluir) {
            btnConfirmarModalExcluir.addEventListener('click', async () => {
                const id = btnConfirmarModalExcluir.dataset.id;
                await handleExcluirItem(id);
            });
        }

    } // Fim de iniciarListeners()
    
    function abrirModalAnalisar(id) {
        const aula = appState.agendamentosPendentes.find(a => a.id_agendamento == id);
        if (!aula) return;
        
        document.getElementById('detalhe-professor').innerText = aula.nome_professor;
        document.getElementById('detalhe-lab-data').innerText = `${aula.nome_laboratorio} | ${formatarData(aula.data_hora_inicio)} (${formatarHorario(aula.data_hora_inicio)} - ${formatarHorario(aula.data_hora_fim)})`;
        document.getElementById('detalhe-kit-nome').innerText = aula.nome_kit || "Nenhum";
        document.getElementById('detalhe-observacoes').innerText = aula.observacoes || "Nenhuma.";
        
        const listaMateriais = document.getElementById('lista-materiais-solicitados');
        
        // Reinicia o formulário de preparo para garantir que a validação funcione
        const formPreparo = document.getElementById('formPreparoSolucoes');
        if(formPreparo) formPreparo.reset();

        if (aula.materiais && aula.materiais.length > 0) {
            listaMateriais.innerHTML = aula.materiais.map(m => {
                const formatoTexto = m.formato.charAt(0).toUpperCase() + m.formato.slice(1);
                const nome = `${m.nome} (${formatoTexto})`;
                const solicitado = `Solicitado: ${m.quantidade} ${m.unidade}`; // Nota: o backend agora retorna a coluna 'quantidade' padronizada.
                
                if (m.formato === 'solucao') {
                    // Se é solução, exige o campo "Peso(g)"
                    return `
                    <li class="list-group-item d-flex justify-content-between align-items-center flex-wrap">
                        <div class="me-3">
                          ${nome}
                          <small class="d-block text-muted">${solicitado}</small> 
                        </div>
                        <div class="d-flex align-items-center" style="max-width: 200px;">
                          <label for="peso-item-${m.id_material}" class="form-label me-2 mb-0 text-nowrap">Peso(g):</label>
                          <input type="number" step="0.01" class="form-control form-control-sm" id="peso-item-${m.id_material}" data-item-id="${m.id_material}" required>
                        </div>
                    </li>`;
                } else {
                    return `
                    <li class="list-group-item">
                        ${nome}
                        <small class="d-block text-muted">${solicitado}</small>
                    </li>`;
                }
            }).join('');
        } else {
            listaMateriais.innerHTML = '<li class="list-group-item">Nenhum material solicitado.</li>';
        }

        document.getElementById('btnConfirmarAnalise').dataset.id = id;
        document.getElementById('btnCancelarAnalise').dataset.id = id;
        
        document.getElementById('analisarModal').classList.add('visivel');
    }

    // ADICIONADO: Função para abrir modal de confirmação de exclusão
    function abrirModalConfirmarExclusao(id) {
        const item = appState.materiais.find(m => m.id == id);
        const modal = document.getElementById("modalConfirmarExclusaoItem");
        if (!item || !modal) return;
        
        // Injeta o nome do item no modal para confirmação
        const modalBody = modal.querySelector('.modal-body p');
        if (modalBody) {
             modalBody.innerHTML = `Tem certeza que deseja excluir o item "<strong>${item.nome}</strong>"? <br/><br/><strong>Atenção:</strong> Esta ação não pode ser desfeita e pode falhar se o item estiver em uso.`;
        }
        
        // Passa o ID para o botão de confirmação
        document.getElementById("confirmarExcluirItemBtn").dataset.id = id;
        
        modal.classList.add("visivel");
    }
    
    // ADICIONADO: Função para processar a exclusão do item
    async function handleExcluirItem(id) {
        const btnConfirmar = document.getElementById("confirmarExcluirItemBtn");
        const originalText = btnConfirmar.innerHTML;
        
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Excluindo...';

        try {
            await window.apiService.deleteMaterial(id); 
            
            // Fecha o modal
            document.getElementById("modalConfirmarExclusaoItem").classList.remove("visivel");
            
            showAlert("Item excluído com sucesso!", "Sucesso", "success");
            
            // Recarrega para obter a lista atualizada
            location.reload(); 

        } catch (error) {
            console.error("Erro ao excluir item:", error);
            showAlert(error.message, "Erro", "error");
        } finally {
            // Restaura o botão em caso de falha
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = 'Confirmar Exclusão'; 
        }
    }


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
        if(toastTitle.childNodes.length > 1) {
             toastTitle.childNodes[1].nodeValue = ` ${title}`;
        } else {
             toastTitle.appendChild(document.createTextNode(` ${title}`));
        }
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
            const dia = String(dataObj.getDate()).padStart(2, '0');
            const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
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
            // Usando UTC para evitar problemas de fuso horário
            const horas = String(dataObj.getHours()).padStart(2, '0');
            const minutos = String(dataObj.getMinutes()).padStart(2, '0');
            return `${horas}:${minutos}`;
        } catch(e) {
            return '00:00';
        }
    }

});