document.addEventListener("DOMContentLoaded", () => {
    const recoverForm = document.getElementById("recuperarSenhaForm");
    const recoverButton = document.getElementById("recover-button");
    const errorMessage = document.getElementById("error-message");
    
    // O objeto `window.apiService` é carregado pelo `apiService.js`
    if (!window.apiService) {
        console.error("apiService.js não foi carregado corretamente.");
        errorMessage.querySelector('p').textContent = 'Erro crítico ao carregar a página. Recarregue.';
        errorMessage.style.display = 'block';
        return;
    }

    if (recoverForm) {
        recoverForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            recoverButton.disabled = true;
            recoverButton.textContent = "Verificando...";
            errorMessage.style.display = 'none';

            const email = document.getElementById("email").value;

            try {
                // Chama o serviço global
                await window.apiService.recuperarSenha(email);

                // Sucesso! E-mail encontrado.
                localStorage.setItem('emailParaRecuperar', email);
                window.location.href = 'novaSenha.html';

            } catch (error) {
                // Erro (e-mail não encontrado)
                console.error("Erro ao tentar recuperar senha:", error);
                errorMessage.querySelector('p').textContent = error.message || 'Não foi possível conectar ao servidor.';
                errorMessage.style.display = 'block';
                
                recoverButton.disabled = false;
                recoverButton.textContent = "Recuperar Senha";
            }
        });
    }
});

