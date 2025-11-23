const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken'); // Para autenticação
const pool = require('./db'); // Importa o pool de conexão MySQL
const path = require('path');

const app = express();
const port = 3000;
const JWT_SECRET = 'seu-segredo-jwt-super-secreto'; // Mude isso para algo seguro

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Rota raiz serve a página inicial do frontend
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- Middleware de Autenticação ---
const autenticarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

  if (token == null) {
    console.warn("Acesso negado: Token não fornecido.");
    return res.sendStatus(401); // Não autorizado (sem token)
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.warn("Acesso negado: Token inválido ou expirado.");
      return res.sendStatus(403); // Proibido (token inválido)
    }
    req.user = user; // Adiciona os dados do usuário (id, nome, tipo_usuario) ao request
    next(); // Continua para a rota
  });
};

// --- ROTAS PÚBLICAS (Login / Recuperação de Senha) ---

app.post('/api/login', async (req, res) => {
  let { email, password, tipo_usuario } = req.body;

  // Normaliza entradas para evitar erros por espaços/caixa
  if (typeof email === 'string') email = email.trim().toLowerCase();
  // Corrigido: Normaliza a senha (trim) para evitar falhas por espaço invisível
  if (typeof password === 'string') password = password.trim(); 
  if (typeof tipo_usuario === 'string') tipo_usuario = tipo_usuario.trim().toLowerCase();

  if (!email || !password || !tipo_usuario) {
    return res.status(400).json({ error: 'E-mail, senha e tipo de usuário são obrigatórios.' });
  }

  try {
    // ATENÇÃO: Autenticação de texto simples (SEM HASH)
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ? AND senha_hash = ? AND tipo_usuario = ?',
      [email, password, tipo_usuario]
    );

    if (rows.length > 0) {
      const user = rows[0];
      
      const payload = { 
        id: user.id_usuario, 
        nome: user.nome, 
        tipo_usuario: user.tipo_usuario 
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

      let redirectTo = '';
      switch (user.tipo_usuario) {
        case 'admin': redirectTo = 'telaAdmin.html'; break;
        case 'professor': redirectTo = 'telaProfessor.html'; break;
        case 'tecnico': redirectTo = 'telaTecnico.html'; break;
        default: redirectTo = 'telaLogin.html';
      }
      
      res.json({ 
        success: true, 
        redirectTo: redirectTo, 
        token: token, 
        userId: user.id_usuario,
        userName: user.nome,
        userType: user.tipo_usuario
      });

    } else {
      res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail, senha e tipo de usuário.' });
    }
  } catch (err) {
    console.error('Erro na rota /api/login:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.post('/api/recuperar-senha', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE email = ?',
      [email]
    );
    if (rows.length > 0) {
      res.json({ success: true, message: 'E-mail encontrado.' });
    } else {
      res.status(404).json({ error: 'E-mail não cadastrado no sistema.' });
    }
  } catch (err) {
    console.error('Erro na rota /api/recuperar-senha:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.post('/api/nova-senha', async (req, res) => {
  const { email, novaSenha } = req.body;
  if (!email || !novaSenha) {
    return res.status(400).json({ error: 'E-mail e nova senha são obrigatórios.' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE usuarios SET senha_hash = ? WHERE email = ?',
      [novaSenha, email]
    );
    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Senha alterada com sucesso!' });
    } else {
      res.status(404).json({ error: 'E-mail não encontrado.' });
    }
  } catch (err) {
    console.error('Erro na rota /api/nova-senha:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.get('/api/laboratorios', autenticarToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT *, id_laboratorio as id FROM laboratorios ORDER BY nome_laboratorio');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// --- ROTAS PROTEGIDAS (Exigem autenticação) ---

/**
 * Helper para buscar materiais de agendamentos.
 */
async function getMateriaisAgendamento(connection, agendamentoId, kitId) {
  let materiais = [];

  // 1. Busca materiais ad-hoc (Tabela agendamento_materiais)
  const [materiaisAdHoc] = await connection.query(
    `SELECT 
       m.nome, m.tipo_material, m.id_material,
       am.quantidade_solicitada, m.unidade, 
       am.formato, am.id_agendamento_material,
       am.peso_preparo_g
     FROM agendamento_materiais am
     JOIN materiais m ON am.fk_material = m.id_material
     WHERE am.fk_agendamento = ?`,
    [agendamentoId]
  );
  
  materiais = materiaisAdHoc.map(m => ({
    ...m,
    quantidade: m.quantidade_solicitada // Padroniza o nome da coluna de quantidade
  }));


  // 2. Busca materiais do kit (Tabela kit_materiais)
  if (kitId) {
    const [materiaisDoKit] = await connection.query(
      `SELECT 
         m.nome, m.tipo_material, m.id_material,
         km.quantidade_no_kit, m.unidade, 
         km.formato
       FROM kit_materiais km
       JOIN materiais m ON km.fk_material = m.id_material
       WHERE km.fk_kit = ?`,
      [kitId]
    );
    
    // Adiciona os materiais do kit à lista
    materiaisDoKit.forEach(mKit => {
      // Evita duplicatas se o mesmo item estiver no kit E ad-hoc (o ad-hoc vence)
      if (!materiais.find(mAdHoc => mAdHoc.id_material === mKit.id_material)) {
        materiais.push({
          ...mKit,
          quantidade: mKit.quantidade_no_kit, // Padroniza
          id_agendamento_material: null, // Marca que veio do kit
          peso_preparo_g: null
        });
      }
    });
  }
  
  return materiais;
}


// [PROFESSOR] Obter agendamentos do professor logado
app.get('/api/professor/agendamentos', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'professor') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  
  let connection;
  try {
    connection = await pool.getConnection();
    const [agendamentos] = await connection.query(
      `SELECT a.*, l.nome_laboratorio, k.nome_kit
       FROM agendamentos a
       LEFT JOIN laboratorios l ON a.fk_laboratorio = l.id_laboratorio
       LEFT JOIN kits k ON a.fk_kit = k.id_kit
       WHERE a.fk_usuario = ?
       ORDER BY a.data_hora_inicio DESC`,
      [req.user.id] // ID do usuário vem do token
    );
    
    for (const agendamento of agendamentos) {
      agendamento.materiais = await getMateriaisAgendamento(
        connection, 
        agendamento.id_agendamento, 
        agendamento.fk_kit
      );
    }
    
    res.json(agendamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// [PROFESSOR] Criar novo agendamento
app.post('/api/professor/agendamentos', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'professor') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const {
    data_hora_inicio, data_hora_fim,
    fk_laboratorio, observacoes, 
    materiais_selecionados,
    fk_kit
  } = req.body;

  if (!data_hora_inicio || !data_hora_fim || !fk_laboratorio) {
    return res.status(400).json({ error: 'Data, horário e laboratório são obrigatórios.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO agendamentos 
        (fk_usuario, data_hora_inicio, data_hora_fim, fk_laboratorio, observacoes, fk_kit, status_agendamento)
       VALUES (?, ?, ?, ?, ?, ?, 'pendente')`,
      [req.user.id, data_hora_inicio, data_hora_fim, fk_laboratorio, observacoes, fk_kit || null]
    );
    const novoAgendamentoId = result.insertId;

    if (materiais_selecionados && materiais_selecionados.length > 0) {
      
      const materiaisValues = materiais_selecionados.map(m => 
        [novoAgendamentoId, m.id_material, m.quantidade, m.formato || 'solido'] 
      );
      
      await connection.query(
        'INSERT INTO agendamento_materiais (fk_agendamento, fk_material, quantidade_solicitada, formato) VALUES ?',
        [materiaisValues]
      );
    }

    await connection.commit();
    const [novoAgendamento] = await pool.query('SELECT * FROM agendamentos WHERE id_agendamento = ?', [novoAgendamentoId]);
    res.status(201).json(novoAgendamento[0]);

  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// [PROFESSOR] Cancelar um agendamento
app.put('/api/professor/agendamentos/:id/cancelar', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'professor' && req.user.tipo_usuario !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    const { id } = req.params;
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [agendamentos] = await connection.query('SELECT * FROM agendamentos WHERE id_agendamento = ?', [id]);
        if (agendamentos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Agendamento não encontrado.' });
        }
        const agendamento = agendamentos[0];

        // Se o professor (ou admin) cancela um agendamento JÁ CONFIRMADO, devolve o estoque
        if (agendamento.status_agendamento === 'confirmado') {
            const materiais = await getMateriaisAgendamento(
                connection, 
                agendamento.id_agendamento, 
                agendamento.fk_kit
            );

            for (const material of materiais) {
                 const [infoBase] = await connection.query('SELECT classificacao, quantidade FROM materiais WHERE id_material = ?', [material.id_material]);
                 material.classificacao = infoBase[0].classificacao;
                 material.estoque_atual = infoBase[0].quantidade;

                 if (material.classificacao === 'consumivel') {
                    let quantidadeADevolver = material.formato === 'solucao' ? 
                                              material.peso_preparo_g :
                                              material.quantidade;

                    if (material.formato === 'solucao' && !material.id_agendamento_material) {
                        quantidadeADevolver = 0; 
                    }

                    if (quantidadeADevolver > 0) {
                        await connection.query('UPDATE materiais SET quantidade = quantidade + ? WHERE id_material = ?', [quantidadeADevolver, material.id_material]);
                        
                        await registrarLogEstoque(
                            connection,
                            material.id_material,
                            material.estoque_atual,
                            material.estoque_atual + quantidadeADevolver,
                            quantidadeADevolver,
                            req.user.id,
                            agendamento.id_agendamento
                        );
                    }
                }
            }
        }

        let query = 'UPDATE agendamentos SET status_agendamento = ? WHERE id_agendamento = ?';
        const params = ['cancelado', id];

        if (req.user.tipo_usuario === 'professor') {
            query += ' AND fk_usuario = ?';
            params.push(req.user.id);
        }

        const [result] = await connection.query(query, params);
        
        await connection.commit();

        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Agendamento cancelado.' });
        } else {
            await connection.rollback(); 
            res.status(404).json({ error: 'Agendamento não encontrado ou não pertence a você.' });
        }
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});


// [PROFESSOR] Obter kits (Professor e Admin podem ver)
app.get('/api/professor/kits', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'professor' && req.user.tipo_usuario !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  try {
    const [kits] = await pool.query(
        `SELECT id_kit as id, nome_kit FROM kits ORDER BY nome_kit`
    );

    const [materiaisDosKits] = await pool.query(
      `SELECT km.fk_kit, m.id_material, m.nome, km.quantidade_no_kit, km.formato, m.unidade, m.tipo_material
       FROM kit_materiais km
       JOIN materiais m ON km.fk_material = m.id_material`
    );

    const kitsComMateriais = kits.map(kit => {
      const materiais = materiaisDosKits
        .filter(m => m.fk_kit === kit.id)
        .map(m => ({
          id: m.id_material,
          nome: m.nome,
          quantidade: m.quantidade_no_kit,
          formato: m.formato,
          unidade: m.unidade,
          tipo_material: m.tipo_material
        }));
      
      return {
        ...kit,
        materiais: materiais
      };
    });

    res.json(kitsComMateriais);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// [PROFESSOR] Criar novo kit
app.post('/api/professor/kits', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'professor') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const { nome_kit, materiais_kit } = req.body; 
  
  if (!nome_kit || !materiais_kit || !Array.isArray(materiais_kit)) {
    return res.status(400).json({ error: 'Nome do kit e lista de materiais são obrigatórios.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query('INSERT INTO kits (nome_kit) VALUES (?)', [nome_kit]);
    const novoKitId = result.insertId;

    if (materiais_kit.length > 0) {
      
      const kitMateriaisValues = materiais_kit.map(m => 
        [novoKitId, m.id_material, m.quantidade, m.formato || 'solido']
      );
      
      await connection.query(
        'INSERT INTO kit_materiais (fk_kit, fk_material, quantidade_no_kit, formato) VALUES ?', 
        [kitMateriaisValues]
      );
    }

    await connection.commit();
    const [novoKit] = await pool.query(
      `SELECT id_kit as id, nome_kit FROM kits WHERE id_kit = ?`, 
      [novoKitId]
    );
    res.status(201).json(novoKit[0]);

  } catch (err) {
    await connection.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Um kit com este nome já existe.' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// [PROFESSOR] Atualizar kit
app.put('/api/professor/kits/:id', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'professor') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const { id } = req.params;
  const { nome_kit, materiais_kit } = req.body;
  
  if (!nome_kit || !materiais_kit || !Array.isArray(materiais_kit)) {
    return res.status(400).json({ error: 'Nome do kit e lista de materiais (mesmo que vazia) são obrigatórios.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query('UPDATE kits SET nome_kit = ? WHERE id_kit = ?', [nome_kit, id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Kit não encontrado.' });
    }

    await connection.query('DELETE FROM kit_materiais WHERE fk_kit = ?', [id]);

    if (materiais_kit.length > 0) {
      const kitMateriaisValues = materiais_kit.map(m => [id, m.id_material, m.quantidade, m.formato || 'solido']);

      await connection.query(
        'INSERT INTO kit_materiais (fk_kit, fk_material, quantidade_no_kit, formato) VALUES ?', 
        [kitMateriaisValues]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Kit atualizado.' });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Um kit com este nome já existe.' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// [PROFESSOR] Excluir kit
app.delete('/api/professor/kits/:id', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'professor' && req.user.tipo_usuario !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Verificar se o kit existe
        const [kitExists] = await connection.query('SELECT id_kit FROM kits WHERE id_kit = ?', [id]);
        if (kitExists.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Kit não encontrado.' });
        }
        
        // Verificar se o kit está sendo usado em agendamentos ANTES de excluir qualquer coisa
        const [agendamentos] = await connection.query(
            'SELECT id_agendamento FROM agendamentos WHERE fk_kit = ?',
            [id]
        );
        
        if (agendamentos.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'Este kit não pode ser excluído pois está sendo usado em agendamentos.' });
        }
        
        // Se chegou aqui, o kit não está em agendamentos, pode excluir com segurança
        await connection.query('DELETE FROM kit_materiais WHERE fk_kit = ?', [id]);
        
        const [result] = await connection.query(
            'DELETE FROM kits WHERE id_kit = ?',
            [id]
        );
        
        await connection.commit();
        
        if (result.affectedRows > 0) {
            res.sendStatus(204); 
        } else {
            res.status(404).json({ error: 'Kit não encontrado.' });
        }
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});


// --- ROTAS DO ADMIN ---

// [ADMIN] Obter todos os usuários
app.get('/api/admin/usuarios', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  try {
    const [rows] = await pool.query('SELECT id_usuario as id, nome, email, tipo_usuario FROM usuarios ORDER BY nome');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// [ADMIN] Criar novo usuário
app.post('/api/admin/usuarios', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const { nome, email, tipo_usuario, senha } = req.body;
  if (!nome || !email || !tipo_usuario || !senha) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.'});
  }
  try {
    // Senha inserida como texto simples - DEVE SER HASHEADA NA VERSÃO FINAL!
    const [result] = await pool.query(
      `INSERT INTO usuarios (nome, email, tipo_usuario, senha_hash) VALUES (?, ?, ?, ?)`,
      [nome, email, tipo_usuario, senha]
    );
    res.status(201).json({ id: result.insertId, nome, email, tipo_usuario });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// [ADMIN] Excluir usuário
app.delete('/api/admin/usuarios/:id', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    const { id } = req.params;
    if (req.user.id == id) {
        return res.status(400).json({ error: 'Você não pode excluir a si mesmo.'});
    }
    try {
        const [result] = await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [id]);
        if (result.affectedRows > 0) {
            res.sendStatus(204);
        } else {
            res.status(404).json({ error: 'Usuário não encontrado.' });
        }
    } catch (err) {
        console.error('Erro ao excluir usuário:', err);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(409).json({ error: 'Este usuário não pode ser excluído pois possui agendamentos ou movimentações registradas.' });
        }
        res.status(500).json({ error: err.message });
    }
});


// [ADMIN/TECNICO/PROFESSOR] Obter todos os materiais (Estoque)
app.get('/api/materiais', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'admin' && req.user.tipo_usuario !== 'tecnico' && req.user.tipo_usuario !== 'professor') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    try {
        const [rows] = await pool.query('SELECT *, id_material as id FROM materiais ORDER BY nome');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// [ADMIN/TECNICO] Criar novo material (Estoque)
app.post('/api/materiais', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'admin' && req.user.tipo_usuario !== 'tecnico') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    
    const { nome, descricao, localizacao, tipo_material, classificacao, quantidade, unidade } = req.body;

    if (!nome || !tipo_material || !classificacao || !quantidade || !unidade) {
         return res.status(400).json({ error: 'Todos os campos (Nome, Tipo, Classificação, Qtd, Unidade) são obrigatórios.'});
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO materiais (nome, descricao, localizacao, tipo_material, classificacao, quantidade, unidade, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'disponivel')`,
            [nome, descricao, localizacao, tipo_material, classificacao, quantidade, unidade]
        );
        const novoMaterialId = result.insertId;

        await registrarLogEstoque(
            connection,
            novoMaterialId,
            0,
            quantidade,
            quantidade,
            req.user.id,
            null
        );

        await connection.commit();
        
        const [novoMaterial] = await pool.query('SELECT *, id_material as id FROM materiais WHERE id_material = ?', [novoMaterialId]);
        res.status(201).json(novoMaterial[0]);

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Erro ao criar material:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// [ADMIN/TECNICO] Desfazer última alteração de estoque
app.post('/api/estoque/undo', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'admin' && req.user.tipo_usuario !== 'tecnico') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [logs] = await connection.query(
            'SELECT * FROM Log_Estoque ORDER BY id_log DESC LIMIT 1'
        );

        if (logs.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Nenhuma alteração para desfazer.' });
        }
        
        const ultimoLog = logs[0];
        
        const [materiais] = await connection.query('SELECT quantidade FROM materiais WHERE id_material = ?', [ultimoLog.fk_material]);
        
        if (materiais.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Material do log não existe mais.' });
        }
        
        const estoqueAtual = materiais[0].quantidade;
        
        if (estoqueAtual != ultimoLog.quantidade_nova) {
             await connection.rollback();
             return res.status(409).json({ error: `Não é possível desfazer. O estoque de "${ultimoLog.fk_material}" mudou. Log: ${ultimoLog.quantidade_nova}, Atual: ${estoqueAtual}.` });
        }

        // Se a quantidade anterior era 0, significa que o item foi criado ou o estoque estava zerado.
        // Se a alteração foi positiva (criação/adição), reverter para 0 pode significar que queremos excluir o item se ele foi recém-criado.
        // O log não diz explicitamente "Criação", mas podemos inferir se quantidade_anterior == 0 e alteracao == quantidade_nova.
        if (parseFloat(ultimoLog.quantidade_anterior) === 0 && parseFloat(ultimoLog.quantidade_nova) === parseFloat(ultimoLog.alteracao)) {
            // Verifica se existem dependências antes de tentar excluir
             try {
                await connection.query('DELETE FROM materiais WHERE id_material = ?', [ultimoLog.fk_material]);
                // Se excluiu com sucesso, remove o log
                await connection.query('DELETE FROM Log_Estoque WHERE id_log = ?', [ultimoLog.id_log]);
                await connection.commit();
                return res.json({ success: true, message: `Alteração desfeita. Material recém-criado foi removido do estoque.` });
             } catch (delErr) {
                 // Se der erro (ex: FK), faz rollback apenas da tentativa de delete e prossegue com o update padrão
                 // Mas como estamos dentro de uma transação, o rollback seria total?
                 // Melhor verificar antes.
             }
        }
        
        // Comportamento padrão: Reverter quantidade
        await connection.query(
            'UPDATE materiais SET quantidade = ? WHERE id_material = ?',
            [ultimoLog.quantidade_anterior, ultimoLog.fk_material]
        );
        
        await connection.query('DELETE FROM Log_Estoque WHERE id_log = ?', [ultimoLog.id_log]);

        await connection.commit();
        res.json({ success: true, message: `Alteração desfeita. Estoque do material ${ultimoLog.fk_material} revertido para ${ultimoLog.quantidade_anterior}.` });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Erro ao desfazer estoque:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        if (connection) connection.release();
    }
});

// [ADMIN/TECNICO] Excluir material (Estoque)
app.delete('/api/materiais/:id', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'admin' && req.user.tipo_usuario !== 'tecnico') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    const { id } = req.params;

    try {
        const [result] = await pool.query('DELETE FROM materiais WHERE id_material = ?', [id]);
        
        if (result.affectedRows > 0) {
            res.sendStatus(204);
        } else {
            res.status(404).json({ error: 'Material não encontrado.' });
        }
    } catch (err) {
        console.error('Erro ao excluir material:', err);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ error: 'Este material não pode ser excluído pois está em uso (em kits, agendamentos ou logs).' });
        }
        res.status(500).json({ error: err.message });
    }
});


// [ADMIN] Obter todos os agendamentos (para visão geral)
app.get('/api/admin/agendamentos', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        const [agendamentos] = await connection.query(
          `SELECT 
             a.*, 
             l.nome_laboratorio, 
             k.nome_kit,
             u.nome as nome_professor
           FROM agendamentos a
           LEFT JOIN laboratorios l ON a.fk_laboratorio = l.id_laboratorio
           LEFT JOIN kits k ON a.fk_kit = k.id_kit
           LEFT JOIN usuarios u ON a.fk_usuario = u.id_usuario
           ORDER BY a.data_hora_inicio DESC`
        );
        
        for (const agendamento of agendamentos) {
          agendamento.materiais = await getMateriaisAgendamento(
            connection, 
            agendamento.id_agendamento, 
            agendamento.fk_kit
          );
        }
        
        res.json(agendamentos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});


// --- ROTAS DO TÉCNICO ---

// [TECNICO] Obter agendamentos pendentes
app.get('/api/tecnico/agendamentos/pendentes', autenticarToken, async (req, res) => {
  if (req.user.tipo_usuario !== 'tecnico' && req.user.tipo_usuario !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  
  let connection;
  try {
    connection = await pool.getConnection();
    const [agendamentos] = await connection.query(
      `SELECT 
         a.*, 
         l.nome_laboratorio, 
         k.nome_kit,
         u.nome as nome_professor
       FROM agendamentos a
       LEFT JOIN laboratorios l ON a.fk_laboratorio = l.id_laboratorio
       LEFT JOIN kits k ON a.fk_kit = k.id_kit
       LEFT JOIN usuarios u ON a.fk_usuario = u.id_usuario
       WHERE a.status_agendamento = 'pendente'
       ORDER BY a.data_hora_inicio ASC`
    );

    for (const agendamento of agendamentos) {
      agendamento.materiais = await getMateriaisAgendamento(
        connection, 
        agendamento.id_agendamento, 
        agendamento.fk_kit
      );
    }

    res.json(agendamentos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// [TECNICO] Atualizar status de um agendamento (Aprovar/Rejeitar)
app.put('/api/tecnico/agendamentos/:id/status', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'tecnico' && req.user.tipo_usuario !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    const { id } = req.params;
    const { status, pesos_solucao } = req.body; 

    if (!status || (status !== 'confirmado' && status !== 'cancelado')) {
        return res.status(400).json({ error: "Status inválido." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [agendamentos] = await connection.query('SELECT * FROM agendamentos WHERE id_agendamento = ?', [id]);
        if (agendamentos.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Agendamento não encontrado.' });
        }
        const agendamento = agendamentos[0];

        // Lógica de dedução de estoque
        if (status === 'confirmado' && agendamento.status_agendamento === 'pendente') {
            
            const materiais = await getMateriaisAgendamento(
                connection, 
                agendamento.id_agendamento, 
                agendamento.fk_kit
            );
            
            for (const material of materiais) {
                 const [estoque] = await connection.query('SELECT quantidade FROM materiais WHERE id_material = ?', [material.id_material]);
                 material.estoque_atual = estoque[0].quantidade;
                 const [infoBase] = await connection.query('SELECT classificacao FROM materiais WHERE id_material = ?', [material.id_material]);
                 material.classificacao = infoBase[0].classificacao;
            }

            for (const material of materiais) {
                if (material.classificacao === 'consumivel') {
                    
                    let quantidadeADeduzir = material.quantidade;
                    
                    if (material.formato === 'solucao') {
                        const pesoInfo = pesos_solucao.find(p => p.id_material == material.id_material);
                        
                        if (!pesoInfo || !pesoInfo.peso || pesoInfo.peso <= 0) {
                            await connection.rollback();
                            return res.status(400).json({ error: `Peso de preparo para "${material.nome}" (Solução) não foi informado ou é inválido.` });
                        }
                        
                        quantidadeADeduzir = parseFloat(pesoInfo.peso);
                        
                        if (material.id_agendamento_material) {
                            await connection.query(
                                'UPDATE agendamento_materiais SET peso_preparo_g = ? WHERE id_agendamento_material = ?',
                                [quantidadeADeduzir, material.id_agendamento_material]
                            );
                        }
                    }

                    if (material.estoque_atual < quantidadeADeduzir) {
                        await connection.rollback();
                        return res.status(400).json({ error: `Estoque insuficiente para "${material.nome}". Necessário: ${quantidadeADeduzir}, Disponível: ${material.estoque_atual}.` });
                    }
                    
                    await connection.query('UPDATE materiais SET quantidade = quantidade - ? WHERE id_material = ?', [quantidadeADeduzir, material.id_material]);
                    
                    await registrarLogEstoque(
                        connection,
                        material.id_material,
                        material.estoque_atual,
                        material.estoque_atual - quantidadeADeduzir,
                        -quantidadeADeduzir,
                        req.user.id,
                        id
                    );
                }
            }
        }
        // Lógica de devolução de estoque
        else if (status === 'cancelado' && agendamento.status_agendamento === 'confirmado') {
             
            const materiais = await getMateriaisAgendamento(
                connection, 
                agendamento.id_agendamento, 
                agendamento.fk_kit
            );
            
            for (const material of materiais) {
                 const [estoque] = await connection.query('SELECT quantidade FROM materiais WHERE id_material = ?', [material.id_material]);
                 material.estoque_atual = estoque[0].quantidade;
                 const [infoBase] = await connection.query('SELECT classificacao FROM materiais WHERE id_material = ?', [material.id_material]);
                 material.classificacao = infoBase[0].classificacao;
            }

            for (const material of materiais) {
                if (material.classificacao === 'consumivel') {
                
                    let quantidadeADevolver = material.formato === 'solucao' ? 
                                              material.peso_preparo_g : 
                                              material.quantidade; 

                    if (material.formato === 'solucao' && !material.id_agendamento_material) {
                        quantidadeADevolver = 0;
                    }

                    if (quantidadeADevolver > 0) {
                        await connection.query('UPDATE materiais SET quantidade = quantidade + ? WHERE id_material = ?', [quantidadeADevolver, material.id_material]);
                        
                        await registrarLogEstoque(
                            connection,
                            material.id_material,
                            material.estoque_atual,
                            material.estoque_atual + parseFloat(quantidadeADevolver),
                            parseFloat(quantidadeADevolver),
                            req.user.id,
                            id
                        );
                    }
                }
            }
        }
        
        const [result] = await connection.query(
            'UPDATE agendamentos SET status_agendamento = ? WHERE id_agendamento = ?',
            [status, id]
        );

        await connection.commit();
        res.json({ success: true, message: `Agendamento ${status}.` });

    } catch (err) {
        await connection.rollback();
        console.error('Erro ao atualizar status:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        connection.release();
    }
});


// [TECNICO/ADMIN] Obter histórico de agendamentos (Todos que não estão pendentes)
app.get('/api/agendamentos/historico', autenticarToken, async (req, res) => {
    if (req.user.tipo_usuario !== 'tecnico' && req.user.tipo_usuario !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        const [agendamentos] = await connection.query(
          `SELECT 
             a.*, 
             l.nome_laboratorio, 
             k.nome_kit,
             u.nome as nome_professor
           FROM agendamentos a
           LEFT JOIN laboratorios l ON a.fk_laboratorio = l.id_laboratorio
           LEFT JOIN kits k ON a.fk_kit = k.id_kit
           LEFT JOIN usuarios u ON a.fk_usuario = u.id_usuario
           WHERE a.status_agendamento != 'pendente'
           ORDER BY a.data_hora_inicio DESC`
        );
        
        for (const agendamento of agendamentos) {
          agendamento.materiais = await getMateriaisAgendamento(
            connection, 
            agendamento.id_agendamento, 
            agendamento.fk_kit
          );
        }
        
        res.json(agendamentos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});


// Inicia o servidor
app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});


/**
 * Helper para registrar movimentações de estoque no Log
 */
async function registrarLogEstoque(connection, materialId, qtdAnterior, qtdNova, alteracao, usuarioId, agendamentoId) {
  if (alteracao === 0) {
    return; // Não loga se nada mudou
  }
  
  const logQuery = `
    INSERT INTO Log_Estoque 
      (fk_material, quantidade_anterior, quantidade_nova, alteracao, fk_usuario_acao, fk_agendamento_acao)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  await connection.query(logQuery, [
    materialId,
    qtdAnterior,
    qtdNova,
    alteracao,
    usuarioId,
    agendamentoId || null
  ]);
}