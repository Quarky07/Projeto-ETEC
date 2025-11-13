document.addEventListener('DOMContentLoaded', function() {
    const novaSenhaForm = document.getElementById('novaSenhaForm');
    const changeButton = document.getElementById('change-password-button');
    const errorMessage = document.getElementById('senha-error'); 
    
    // O objeto `window.apiService` é carregado pelo `apiService.js`
    if (!window.apiService) {
        console.error("apiService.js não foi carregado corretamente.");
        errorMessage.querySelector('p').textContent = 'Erro crítico ao carregar a página. Recarregue.';
        errorMessage.style.display = 'block';
        return;
    }

    const email = localStorage.getItem('emailParaRecuperar');
    if (!email) {
        errorMessage.querySelector('p').textContent = 'Nenhum e-mail encontrado para recuperação. Por favor, volte ao início.';
        errorMessage.style.display = 'block';
        changeButton.disabled = true; 
        return;
    }

    if (novaSenhaForm) {
        novaSenhaForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const novaSenha = document.getElementById('nova-senha').value;
            const confirmarSenha = document.getElementById('confirmar-senha').value;
            
            if (novaSenha !== confirmarSenha) {
                errorMessage.querySelector('p').textContent = 'As senhas não coincidem. Tente novamente.';
                errorMessage.style.display = 'block';
                errorMessage.classList.remove('success-message');
                return;
            }
            
            errorMessage.style.display = 'none';
            changeButton.disabled = true;
            changeButton.textContent = 'Alterando...';

            try {
                // Chama o serviço global
                await window.apiService.definirNovaSenha(email, novaSenha);

                // --- SUCESSO ---
                errorMessage.querySelector('p').textContent = 'Senha alterada com sucesso! Redirecionando para o login...';
                errorMessage.classList.add('success-message');
                errorMessage.style.display = 'block';
                
                localStorage.removeItem('emailParaRecuperar');
                
                setTimeout(() => {
                    window.location.href = 'telaLogin.html';
                }, 2000);

            } catch (error) {
                // --- ERRO ---
                console.error("Erro ao alterar senha:", error);
                errorMessage.querySelector('p').textContent = error.message || 'Não foi possível conectar ao servidor.';
                errorMessage.classList.remove('success-message');
                errorMessage.style.display = 'block';
                
                changeButton.disabled = false;
                changeButton.textContent = 'Alterar Senha';
            }
        });
    }

    document.getElementById('confirmar-senha').addEventListener('input', function() {
        if (errorMessage.querySelector('p').textContent === 'As senhas não coincidem. Tente novamente.') {
            errorMessage.style.display = 'none';
        }
    });
});

