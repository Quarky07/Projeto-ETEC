-- Active: 1762348847253@@127.0.0.1@3306@etec_laboratorio
-- ====================================================================================
-- SCRIPT COMPLETO PARA CRIAÇÃO DO BANCO DE DADOS
-- VERSÃO "LIMPA" (PÓS-TRUNCATE)
-- CONTÉM APENAS A ESTRUTURA E OS DADOS BASE ESSENCIAIS.
-- ====================================================================================

-- ====================================================================================
-- ETAPA 1: CRIAÇÃO DO BANCO DE DADOS E TABELAS
-- ====================================================================================

-- Cria o banco de dados se ele ainda não existir, com suporte a caracteres especiais
CREATE DATABASE IF NOT EXISTS `etec_laboratorio` 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Define o banco de dados recém-criado como o padrão para os comandos a seguir
USE `etec_laboratorio`;

-- Tabela para gerenciar os usuários do sistema
CREATE TABLE `usuarios` (
  `id_usuario` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `senha_hash` VARCHAR(255) NOT NULL,
  `tipo_usuario` ENUM('professor', 'admin', 'tecnico') NOT NULL DEFAULT 'professor',
  `data_criacao` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela central para todos os materiais (COM A COLUNA 'classificacao')
CREATE TABLE `materiais` (
  `id_material` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(255) NOT NULL,
  `descricao` TEXT,
  `tipo_material` ENUM('equipamento', 'vidraria', 'reagente', 'consumivel') NOT NULL,
  `classificacao` ENUM('ferramenta', 'consumivel') NOT NULL, -- Coluna da nova regra de negócio
  `quantidade` DECIMAL(10,2) NOT NULL,
  `unidade` VARCHAR(20),
  `localizacao` VARCHAR(255),
  `status` ENUM('disponivel', 'em_uso', 'manutencao', 'quebrado') NOT NULL DEFAULT 'disponivel',
  `observacoes` TEXT
) ENGINE=InnoDB;

-- Tabela para definir os kits
CREATE TABLE `kits` (
  `id_kit` INT AUTO_INCREMENT PRIMARY KEY,
  `nome_kit` VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB;


-- Tabela de associação para definir quais materiais compõem um kit
CREATE TABLE `kit_materiais` (
  `id_kit_material` INT AUTO_INCREMENT PRIMARY KEY,
  `fk_kit` INT NOT NULL,
  `fk_material` INT NOT NULL,
  `quantidade_no_kit` INT NOT NULL,
  `formato` ENUM('solido', 'solucao') NOT NULL DEFAULT 'solido',
  FOREIGN KEY (`fk_kit`) REFERENCES `kits`(`id_kit`) ON DELETE CASCADE,
  FOREIGN KEY (`fk_material`) REFERENCES `materiais`(`id_material`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabela para registrar movimentações de estoque
CREATE TABLE `movimentacoes` (
  `id_movimentacao` INT AUTO_INCREMENT PRIMARY KEY,
  `fk_material` INT NOT NULL,
  `fk_usuario` INT,
  `tipo_movimentacao` ENUM('entrada', 'saida', 'baixa_quebra', 'ajuste') NOT NULL,
  `quantidade` DECIMAL(10,2) NOT NULL,
  `data_movimentacao` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `observacoes` TEXT,
  FOREIGN KEY (`fk_material`) REFERENCES `materiais`(`id_material`),
  FOREIGN KEY (`fk_usuario`) REFERENCES `usuarios`(`id_usuario`)
) ENGINE=InnoDB;

-- Tabela para gerenciar os laboratórios
CREATE TABLE `laboratorios` (
  `id_laboratorio` INT AUTO_INCREMENT PRIMARY KEY,
  `nome_laboratorio` VARCHAR(100) NOT NULL UNIQUE,
  `localizacao_sala` VARCHAR(100),
  `descricao` TEXT
) ENGINE=InnoDB;

-- Tabela de agendamentos
CREATE TABLE `agendamentos` (
  `id_agendamento` INT AUTO_INCREMENT PRIMARY KEY,
  `fk_usuario` INT NOT NULL,
  `fk_laboratorio` INT NOT NULL,
  `fk_material` INT,
  `fk_kit` INT,
  `data_hora_inicio` DATETIME NOT NULL,
  `data_hora_fim` DATETIME NOT NULL,
  `status_agendamento` ENUM('confirmado', 'pendente', 'cancelado', 'concluido') NOT NULL DEFAULT 'pendente',
  `observacoes` TEXT,
  FOREIGN KEY (`fk_usuario`) REFERENCES `usuarios`(`id_usuario`),
  FOREIGN KEY (`fk_laboratorio`) REFERENCES `laboratorios`(`id_laboratorio`),
  FOREIGN KEY (`fk_material`) REFERENCES `materiais`(`id_material`),
  FOREIGN KEY (`fk_kit`) REFERENCES `kits`(`id_kit`),
  CONSTRAINT `chk_datas` CHECK (`data_hora_fim` > `data_hora_inicio`)
) ENGINE=InnoDB;

-- Tabela para associar materiais a um agendamento específico
CREATE TABLE `agendamento_materiais` (
    `id_agendamento_material` INT AUTO_INCREMENT PRIMARY KEY,
    `fk_agendamento` INT NOT NULL,
    `fk_material` INT NOT NULL,
    `quantidade_solicitada` DECIMAL(10, 2) NOT NULL,
    `formato` ENUM('solido', 'solucao') NOT NULL DEFAULT 'solido',
    `peso_preparo_g` DECIMAL(10,2) NULL,
    FOREIGN KEY (`fk_agendamento`) REFERENCES `agendamentos`(`id_agendamento`) ON DELETE CASCADE,
    FOREIGN KEY (`fk_material`) REFERENCES `materiais`(`id_material`)
);

-- Tabela para a função "Desfazer"
CREATE TABLE `Log_Estoque` (
  `id_log` INT AUTO_INCREMENT PRIMARY KEY,
  `fk_material` INT NOT NULL,
  `quantidade_anterior` DECIMAL(10,2) NOT NULL,
  `quantidade_nova` DECIMAL(10,2) NOT NULL,
  `alteracao` DECIMAL(10,2) NOT NULL, -- (quantidade_nova - quantidade_anterior)
  `fk_usuario_acao` INT NOT NULL,
  `fk_agendamento_acao` INT NULL, -- Para rastrear baixas automáticas
  `data_acao` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `revertido` BOOLEAN NOT NULL DEFAULT FALSE,
  `fk_log_revertido` INT NULL, -- Se esta entrada for uma reversão, aponta para o log original
  FOREIGN KEY (`fk_material`) REFERENCES `materiais`(`id_material`),
  FOREIGN KEY (`fk_usuario_acao`) REFERENCES `usuarios`(`id_usuario`),
  FOREIGN KEY (`fk_agendamento_acao`) REFERENCES `agendamentos`(`id_agendamento`),
  FOREIGN KEY (`fk_log_revertido`) REFERENCES `Log_Estoque`(`id_log`)
) ENGINE=InnoDB;


-- ====================================================================================
-- ETAPA 2: INSERÇÃO DE DADOS BASE (POPULAÇÃO ESSENCIAL)
-- ====================================================================================

-- Populando os usuários default (IDs: 1, 2, 3)
INSERT INTO `usuarios` (`nome`, `email`, `senha_hash`, `tipo_usuario`) VALUES
('coordenador','adm@etec.org.br','adm123','admin');

-- Populando a tabela de MATERIAIS (Equipamentos)
-- (IDs 1-27)
INSERT INTO `materiais` (`nome`, `tipo_material`, `classificacao`, `quantidade`, `unidade`, `localizacao`, `status`) VALUES
('Balança Analitica', 'equipamento', 'ferramenta', 2, 'unidades', 'Lab. 1 - Bancada', 'disponivel'),
('Balança Semi analitica', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 1 - Bancada', 'disponivel'),
('pHmetro', 'equipamento', 'ferramenta', 4, 'unidades', 'Lab. 1 - Bancada', 'disponivel'),
('Mufla', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Estufa', 'equipamento', 'ferramenta', 2, 'unidades', 'Lab. 1 e 2 - Bancada', 'disponivel'),
('Capela', 'equipamento', 'ferramenta', 2, 'unidades', 'Lab. 1 e 2 - Bancada', 'disponivel'),
('Dessecador', 'equipamento', 'ferramenta', 4, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Deionizador', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 1 - Bancada', 'disponivel'),
('Condutivímetro', 'equipamento', 'ferramenta', 2, 'unidades', 'Lab. 3 - Bancada', 'disponivel'),
('Prensa', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2', 'disponivel'),
('Liquidificador Industrial', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2', 'disponivel'),
('Destilador de Nitrogênio', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 1 - Bancada', 'disponivel'),
('Espectrofotômetro', 'equipamento', 'ferramenta', 2, 'unidades', 'Lab. 3 - Bancada', 'disponivel'),
('Fotômetro de Chamas', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 3 - Bancada', 'disponivel'),
('HPLC', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 3 - Bancada', 'disponivel'),
('Refratômetro', 'equipamento', 'ferramenta', 3, 'unidades', 'Lab. 3 - Bancada', 'disponivel'),
('Viscosimetro Brookfield', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Forno', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Estufa Thermosolda', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Agitador Mecânico', 'equipamento', 'ferramenta', 3, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Bateria para Extração Soxhlet', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 2 - Bancada', 'disponivel'),
('Ponto de Fusão', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 1 - Bancada', 'disponivel'),
('Banho de Ultrassom', 'equipamento', 'ferramenta', 1, 'unidades', 'Lab. 3 - Bancada', 'disponivel'),
('Banho Maria', 'equipamento', 'ferramenta', 2, 'unidades', 'Lab. 3 - Bancada', 'quebrado'),
('Manta Aquecedora 250mL', 'equipamento', 'ferramenta', 1, 'unidades', 'Armário 7', 'disponivel'),
('Manta Aquecedora 500mL', 'equipamento', 'ferramenta', 6, 'unidades', 'Armário 7', 'disponivel'),
('Manta Aquecedora 1000mL', 'equipamento', 'ferramenta', 1, 'unidades', 'Armário 7', 'disponivel');

-- Populando a tabela de MATERIAIS (Vidrarias e Consumíveis)
-- (IDs 28-40)
INSERT INTO `materiais` (`nome`, `descricao`, `tipo_material`, `classificacao`, `quantidade`, `unidade`, `localizacao`, `status`) VALUES
('Béquer de vidro', '250mL', 'vidraria', 'ferramenta', 44, 'unidades', 'Estoque', 'disponivel'),
('Béquer de vidro', '100mL', 'vidraria', 'ferramenta', 36, 'unidades', 'Estoque', 'disponivel'),
('Balão volumétrico', '100mL', 'vidraria', 'ferramenta', 12, 'unidades', 'Estoque', 'disponivel'),
('Balão volumétrico', '250mL', 'vidraria', 'ferramenta', 15, 'unidades', 'Estoque', 'disponivel'),
('Pipeta volumétrica', '10mL', 'vidraria', 'ferramenta', 25, 'unidades', 'Estoque', 'disponivel'),
('Pipeta volumétrica', '25mL', 'vidraria', 'ferramenta', 7, 'unidades', 'Estoque', 'disponivel'),
('Proveta graduada de vidro', '100mL', 'vidraria', 'ferramenta', 8, 'unidades', 'Estoque', 'disponivel'),
('Bureta', '25 mL', 'vidraria', 'ferramenta', 0, 'unidades', 'Estoque', 'disponivel'),
('Pipetador Pump', '25 mL', 'consumivel', 'consumivel', 0, 'unidades', 'Estoque', 'disponivel'),
('Termômetro', 'Digital', 'equipamento', 'ferramenta', 4, 'unidades', 'Em uso', 'disponivel'),
('Termômetro', 'Mercúrio', 'equipamento', 'ferramenta', 1, 'unidades', 'Em uso', 'disponivel'),
('Papel de Filtro', 'Azul 12,5 cm', 'consumivel', 'consumivel', 100, 'folhas', 'Estoque', 'disponivel'),
('Papel de Filtro', 'Preto', 'consumivel', 'consumivel', 0, 'caixas', 'Estoque', 'disponivel');

-- Populando a tabela de MATERIAIS (Reagentes)
-- (IDs 41-46)
INSERT INTO `materiais` (`nome`, `tipo_material`, `classificacao`, `quantidade`, `unidade`, `localizacao`) VALUES
('Acetona', 'reagente', 'consumivel', 650, 'mL', 'A6 - Álcoois e Cetonas'),
('Ácido Acético Glacial', 'reagente', 'consumivel', 400, 'mL', 'A20 - Ácidos'),
('Ácido Clorídrico', 'reagente', 'consumivel', 1000, 'mL', 'A20 - Ácidos'),
('Hidróxido de Sódio', 'reagente', 'consumivel', 1000, 'g', 'A19 - Bases'),
('Sulfato de Cobre II', 'reagente', 'consumivel', 100, 'g', 'XXVI - Sais de Sais de Cobre'),
('Cloreto de Sódio', 'reagente', 'consumivel', 1000, 'g', 'XXVII - Sais de Sódio');

-- Populando a tabela de laboratórios
INSERT INTO `laboratorios` (`nome_laboratorio`, `localizacao_sala`) VALUES
('Laboratório 1', 'Bloco A - Sala 101'),
('Laboratório 2', 'Bloco A - Sala 102'),
('Laboratório 3', 'Bloco B - Sala 205');

-- Criando o Kit de Titulação (ID 1)
INSERT INTO `kits` (`id_kit`, `nome_kit`) VALUES
(1, 'Kit de Titulação Padrão');

-- Associando os materiais ao Kit de Titulação (ID 1)
-- IDs dos materiais: 35 (Bureta), 28 (Béquer 250mL), 32 (Pipeta 10mL)
INSERT INTO `kit_materiais` (`fk_kit`, `fk_material`, `quantidade_no_kit`) VALUES
(1, 35, 1), -- 1x Bureta 25 mL
(1, 28, 2), -- 2x Béquer de vidro 250mL
(1, 32, 1); -- 1x Pipeta volumétrica 10mL

-- ====================================================================================
-- FIM DO SCRIPT DE ESTADO LIMPO
-- As tabelas agendamentos, agendamento_materiais, movimentacoes e Log_Estoque
-- estão vazias, conforme solicitado pelo script de limpeza.
-- ====================================================================================