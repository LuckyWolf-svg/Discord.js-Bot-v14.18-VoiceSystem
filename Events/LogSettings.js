import { EmbedBuilder } from 'discord.js';
import { CHANNEL_IDS } from '../server_ids.js';

/**
 * Форматирует дату в нужный формат: "DD.MM.YYYY HH:MM:SS"
 * @returns {string} Отформатированная дата и время
 */
function getFormattedDateTime() {
    const now = new Date();
    
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${day}.${month}.${year} • ${hours}:${minutes}:${seconds}`;
}

/**
 * Отправляет embed в канал логов
 * @param {Client} client - Discord клиент
 * @param {string} title - Заголовок embed
 * @param {string} description - Описание embed
 * @param {string} color - Цвет embed в HEX
 * @param {Object} fields - Дополнительные поля
 */
export async function sendLogEmbed(client, title, description, color, fields = []) {
    try {
        const logChannel = await client.channels.fetch(CHANNEL_IDS.LOGS);
        if (!logChannel) {
            console.error('Лог-канал не найден!');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setFooter({ text: getFormattedDateTime() });

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при отправке лога:', error);
    }
}
