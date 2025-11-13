document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const loginButton = document.getElementById("login-button");
    const loginError = document.getElementById("login-error");
    const API_URL = 'http://localhost:3000/api';

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            loginButton.disabled = true;
            loginButton.textContent = "Entrando...";
            loginError.style.display = 'none';

            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            const tipo_usuario = document.getElementById("account-type").value;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password, // Envia a senha em texto simples (plaintext)
                        tipo_usuario: tipo_usuario
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Sucesso
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('userName', data.userName || data.nome);
                    localStorage.setItem('userType', data.userType); // usa o valor do backend
                    window.location.href = data.redirectTo;
                } else {
                    // Erro
                    loginError.querySelector('p').textContent = data.error || 'Erro desconhecido.';
                    loginError.style.display = 'block';
                }

            } catch (error) {
                console.error("Erro ao tentar fazer login:", error);
                loginError.querySelector('p').textContent = 'Não foi possível conectar ao servidor. Tente novamente.';
                loginError.style.display = 'block';
            }

            loginButton.disabled = false;
            loginButton.textContent = "Entrar";
        });
    }
});