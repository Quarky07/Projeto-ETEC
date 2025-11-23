require('dotenv').config();
const mysql = require('mysql2/promise');

// Usa defaults sensatos se variáveis de ambiente não estiverem definidas
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
  console.warn('[AVISO] Variáveis de ambiente do banco ausentes. Usando configurações padrão:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database
  });
}

// Configuração do Pool de Conexões
const pool = mysql.createPool(dbConfig);

// Teste de Conexão
pool.getConnection()
  .then(connection => {
    console.log('Conexão com o banco de dados MySQL estabelecida com sucesso!');
    connection.release();
  })
  .catch(err => {
    console.error('Erro ao conectar ao banco de dados:', err);
  });

module.exports = pool;
