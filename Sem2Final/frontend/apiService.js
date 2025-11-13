/**
 * apiService.js
 * * Este arquivo centraliza todas as chamadas de API (fetch) da aplicação.
 * Ele expõe um objeto global `window.apiService` que os outros scripts
 * (telaLogin.js, telaProfessor.js, etc.) podem usar.
 */
(function() {
    'use strict';

    const API_URL = 'http://localhost:3000/api';

    /**
     * Helper PRIVADO para chamadas de API públicas (que não exigem token).
     * Usado para login e recuperação de senha.
     */
    async function fetchPublico(url, options = {}) {
        try {
            const response = await fetch(url, options);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Erro desconhecido.');
            }
            return data;
        } catch (error) {
            console.error('Erro no fetchPublico:', error);
            throw error; // Re-lança o erro para o script que chamou
        }
    }

    /**
     * Helper PRIVADO para chamadas de API autenticadas (que exigem token).
     */
    async function fetchComToken(url, options = {}) {
        const token = localStorage.getItem('token');

        if (!token) {
            window.location.href = 'telaLogin.html';
            return; 
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        };

        try {
            const response = await fetch(url, { ...options, headers });

            if (response.status === 401 || response.status === 403) {
                localStorage.clear();
                window.location.href = 'telaLogin.html';
                throw new Error('Token inválido ou expirado.');
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
            }
            
            return response.status === 204 ? null : response.json();

        } catch (error) {
            console.error(`Erro no fetchComToken para ${url}:`, error);
            throw error;
        }
    }

    /**
     * Objeto global de API
     * Contém todas as funções que as páginas podem chamar.
     */
    window.apiService = {

        // --- Rotas Públicas ---
        login: (email, password, tipo_usuario) => {
            return fetchPublico(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, tipo_usuario })
            });
        },
        recuperarSenha: (email) => {
             return fetchPublico(`${API_URL}/recuperar-senha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
        },
        definirNovaSenha: (email, novaSenha) => {
            return fetchPublico(`${API_URL}/nova-senha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, novaSenha })
            });
        },

        // --- Rotas Comuns (Autenticadas) ---
        getLaboratorios: () => {
            return fetchComToken(`${API_URL}/laboratorios`);
        },
        getMateriais: () => {
             return fetchComToken(`${API_URL}/materiais`);
        },
        createMaterial: (itemData) => {
            // Esta função é genérica, ela envia o objeto itemData
            // A lógica de criar o objeto correto fica no telaAdmin.js/telaTecnico.js
            return fetchComToken(`${API_URL}/materiais`, {
                method: 'POST',
                body: JSON.stringify(itemData)
            });
        },
        getHistorico: () => {
            // Rota movida para /api/agendamentos/historico (usada pelo Técnico/Admin)
            return fetchComToken(`${API_URL}/agendamentos/historico`);
        },

        // --- Rotas de Professor ---
        getAgendamentosProfessor: () => {
            return fetchComToken(`${API_URL}/professor/agendamentos`);
        },
        createAgendamento: (agendamentoData) => {
            return fetchComToken(`${API_URL}/professor/agendamentos`, {
                method: 'POST',
                body: JSON.stringify(agendamentoData)
            });
        },
        cancelarAgendamentoProfessor: (id) => {
             return fetchComToken(`${API_URL}/professor/agendamentos/${id}/cancelar`, {
                method: 'PUT'
            });
        },
        getKits: () => {
            return fetchComToken(`${API_URL}/professor/kits`);
        },
        createKit: (kitData) => {
            // Esta função envia o kitData (que será montado em telaProfessor.js)
            return fetchComToken(`${API_URL}/professor/kits`, {
                method: 'POST',
                body: JSON.stringify(kitData)
            });
        },
        updateKit: (id, kitData) => {
            return fetchComToken(`${API_URL}/professor/kits/${id}`, {
                method: 'PUT',
                body: JSON.stringify(kitData)
            });
        },
        deleteKit: (id) => {
            return fetchComToken(`${API_URL}/professor/kits/${id}`, {
                method: 'DELETE'
            });
        },
        
        // --- Rotas de Técnico/Admin ---
        getAgendamentosPendentes: () => {
            return fetchComToken(`${API_URL}/tecnico/agendamentos/pendentes`);
        },
        // ATUALIZADO (Tarefa 4): Agora aceita 'pesos_solucao'
        updateStatusAgendamento: (id, status, pesos_solucao = null) => {
             return fetchComToken(`${API_URL}/tecnico/agendamentos/${id}/status`, {
                method: 'PUT',
                body: JSON.stringify({ 
                  status: status,
                  pesos_solucao: pesos_solucao // Envia os pesos para o backend
                })
            });
        },

        // --- Rotas de Admin ---
        getAgendamentosAdmin: () => {
            return fetchComToken(`${API_URL}/admin/agendamentos`);
        },
        getUsuarios: () => {
            return fetchComToken(`${API_URL}/admin/usuarios`);
        },
        createUsuario: (userData) => {
            return fetchComToken(`${API_URL}/admin/usuarios`, {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },
        deleteUsuario: (id) => {
            return fetchComToken(`${API_URL}/admin/usuarios/${id}`, {
                method: 'DELETE'
            });
        },

        // ADICIONADO (Tarefa 3): Rota para desfazer alteração no estoque
        undoEstoqueChange: () => {
            return fetchComToken(`${API_URL}/estoque/undo`, {
                method: 'POST'
            });
        },
    };

})(); // Fim da IIFE

