import { useState, useEffect } from 'react';
import * as vkBridgeModule from '@vkontakte/vk-bridge';
import { View, Panel, PanelHeader, PanelHeaderBack, Group, Cell, Avatar, Spinner, Button, Div, Title, Text, SimpleCell, SplitLayout, SplitCol, FormItem, Input, Switch, SegmentedControl, Search } from '@vkontakte/vkui';
import { Icon28PaymentCardOutline, Icon28UserOutline, Icon28GiftOutline, Icon28ListOutline, Icon28DownloadOutline } from '@vkontakte/icons';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

const vkBridge = vkBridgeModule.default || vkBridgeModule;

const API_URL = "http://localhost:8000";

interface UserData {
  id: number;
  vk_id: number;
  first_name: string;
  last_name: string;
  balance: number;
  status: string;
  referral_code: string;
  is_admin?: boolean;
  is_cashier?: boolean;
}

interface ClientData {
  id: number;
  vk_id: number;
  tg_id: number;
  full_name: string;
  phone: string;
  balance: number;
  status: string;
  referral_code: string;
  registered_at: string;
}

function App() {
  const [activePanel, setActivePanel] = useState('main');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [adminTab, setAdminTab] = useState<'users' | 'transactions'>('users');
  const [selectedClient, setSelectedClient] = useState<ClientData | null>(null);
  const [clientRole, setClientRole] = useState<string>('user');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Scanner state
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [scanTargetData, setScanTargetData] = useState<UserData | null>(null);
  const [transactionAmount, setTransactionAmount] = useState<string>('');
  const [isDeducting, setIsDeducting] = useState<boolean>(false);

  useEffect(() => {
    async function fetchTargetData() {
      if (!scanTarget) {
        setScanTargetData(null);
        return;
      }
      try {
        const res = await axios.get(`${API_URL}/api/user/${scanTarget}`);
        setScanTargetData(res.data);
      } catch (e) {
        console.error("Target user not found");
      }
    }
    fetchTargetData();
  }, [scanTarget]);

  useEffect(() => {
    async function fetchData() {
      // Check if URL has a scan anchor
      const hash = window.location.hash;
      let initialScanTarget = null;
      if (hash.startsWith('#scan_')) {
        initialScanTarget = hash.replace('#scan_', '');
        setScanTarget(initialScanTarget);
      }

      try {
        let userId = null;
        try {
          const user = await vkBridge.send('VKWebAppGetUserInfo');
          userId = user.id;
        } catch (bridgeError) {
          console.warn("VK Bridge unavailable, using mock user 532232600");
          userId = 532232600;
        }

        const res = await axios.get(`${API_URL}/api/user/${userId}`);
        setUserData(res.data);

        // If user is admin/cashier AND they just scanned a QR code (URL hash)
        if ((res.data.is_admin || res.data.is_cashier) && initialScanTarget) {
          setActivePanel('scanner');
        }
      } catch (e: any) {
        setError('Не удалось загрузить данные профиля. Убедитесь, что сервер uvicorn (main.py) запущен на порту 8000.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const copyRefLink = async () => {
    if (!userData) return;
    const link = `https://vk.me/public206577473?ref=${userData.referral_code}`;
    try {
      await vkBridge.send("VKWebAppCopyText", { text: link });
    } catch {
      navigator.clipboard.writeText(link);
    }
    alert("Ссылка скопирована!");
  };

  const loadAdminData = async () => {
    setActivePanel('admin');
    if (!userData) return;
    setLoading(true);
    try {
      const [resUsers, resTx] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users?admin_id=${userData.vk_id}`),
        axios.get(`${API_URL}/api/admin/transactions?admin_id=${userData.vk_id}`)
      ]);
      setClients(resUsers.data);
      setTransactions(resTx.data);
    } catch {
      setError('Ошибка доступа к админ-панели');
    } finally {
      setLoading(false);
    }
  };

  const openClientDetails = (client: ClientData) => {
    setSelectedClient(client);
    setActivePanel('client_details');
    axios.get(`${API_URL}/api/user/${client.vk_id}`).then(res => {
      if (res.data.is_admin) setClientRole('admin');
      else if (res.data.is_cashier) setClientRole('cashier');
      else setClientRole('user');
    });
  };

  const setRole = async (targetVkId: number, role: string) => {
    if (!userData) return;
    try {
      await axios.post(`${API_URL}/api/admin/set_role`, {
        admin_id: userData.vk_id,
        target_vk_id: targetVkId,
        role
      });
      setClientRole(role);
      alert(`Роль успешно изменена!`);
    } catch {
      alert('Ошибка при смене роли.');
    }
  };

  const downloadCSV = () => {
    const headers = ["ID", "VK/TG ID", "Имя", "Телефон", "Баланс", "Статус", "Реф. код", "Дата рег."];
    const rows = clients.map(c => [
      c.id, `VK:${c.vk_id || ''}/TG:${c.tg_id || ''}`, c.full_name, c.phone || '', c.balance, c.status, c.referral_code, c.registered_at
    ]);
    let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "AiHookah_Clients.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTransactionsCSV = async () => {
    if (!userData || !userData.is_admin) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/admin/transactions?admin_id=${userData.vk_id}`);
      const headers = ["ID", "Дата", "Клиент", "VK ID", "Сумма чека", "Начислено/Списано баллов", "Описание"];
      const rows = res.data.map((t: any) => [
        t.id, t.date, t.client_name, t.client_vk_id, t.amount, t.points_change, t.description
      ]);
      let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map((e: any) => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "AiHookah_Transactions.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert("Ошибка при выгрузке транзакций.");
    } finally {
      setLoading(false);
    }
  };

  const processTransaction = async () => {
    if (!userData || !scanTarget || !transactionAmount) return;
    setLoading(true);
    let amount = parseFloat(transactionAmount);
    if (isDeducting) {
      amount = -Math.abs(amount); // Deduct
    } else {
      amount = Math.abs(amount); // Add
    }

    try {
      const res = await axios.post(`${API_URL}/api/admin/transaction`, {
        admin_id: userData.vk_id,
        client_vk_id: parseInt(scanTarget),
        amount: amount
      });
      alert(`Успешно! ${res.data.message}\nНовый баланс клиента: ${res.data.new_balance}`);
      setActivePanel('main');
      setScanTarget(null);
      setTransactionAmount('');
      setIsDeducting(false);
      window.location.hash = ''; // Clear hash
    } catch (e: any) {
      alert("Ошибка обработки: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  if (loading && activePanel === 'main') {
    return (
      <SplitLayout>
        <SplitCol>
          <View activePanel="spinner">
            <Panel id="spinner">
              <PanelHeader>AiHookah Store</PanelHeader>
              <Group style={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size="l" />
              </Group>
            </Panel>
          </View>
        </SplitCol>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout header={<PanelHeader delimiter="none" />}>
      <SplitCol>
        <View activePanel={activePanel}>
          <Panel id="main">
            <PanelHeader>Лояльность</PanelHeader>

            {error && (
              <Group>
                <Div><Text style={{ color: '#ff5252', textAlign: 'center' }}>{error}</Text></Div>
              </Group>
            )}

            {userData && (
              <>
                <Group>
                  <Cell
                    before={<Avatar size={72} src="" fallbackIcon={<Icon28UserOutline />} />}
                    subtitle={userData.status}
                  >
                    <Title level="2">{userData.first_name} {userData.last_name}</Title>
                  </Cell>
                </Group>

                <Group>
                  <Div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)',
                    borderRadius: 20,
                    margin: 16,
                    padding: 32,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
                  }}>
                    <Title level="3" style={{ color: '#ffffff', marginBottom: 8 }}>Моя Карта AiHookah</Title>
                    <Text style={{ color: '#8e8e93', marginBottom: 24 }}>Предъявите код на кассе</Text>

                    <div style={{ background: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 24 }}>
                      <QRCodeSVG
                        value={`http://localhost:5173/#scan_${userData.vk_id}`}
                        size={180}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Icon28PaymentCardOutline style={{ color: '#0a84ff' }} width={42} height={42} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Text style={{ color: '#8e8e93', fontSize: 13 }}>Доступно баллов</Text>
                        <Title level="1" style={{ color: '#ffffff', fontSize: '2.5rem', lineHeight: '1.2' }}>{userData.balance}</Title>
                      </div>
                    </div>
                  </Div>
                </Group>

                <Group>
                  <Div>
                    <Button
                      size="l"
                      stretched
                      mode="secondary"
                      before={<Icon28GiftOutline />}
                      onClick={copyRefLink}
                    >
                      Пригласить друга (+50 баллов)
                    </Button>
                  </Div>
                </Group>

                {(userData.is_admin || userData.is_cashier) && (
                  <Group>
                    <Div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="l"
                        stretched
                        mode="secondary"
                        before={<Icon28PaymentCardOutline />}
                        onClick={() => { setScanTarget(null); setActivePanel('scanner'); }}
                      >
                        Открыть кассу
                      </Button>
                      {userData.is_admin && (
                        <Button
                          size="l"
                          stretched
                          mode="primary"
                          appearance="accent"
                          before={<Icon28ListOutline />}
                          onClick={loadAdminData}
                        >
                          Админ
                        </Button>
                      )}
                    </Div>
                  </Group>
                )}
              </>
            )}
          </Panel>

          <Panel id="admin">
            <PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel('main')} />}>
              База клиентов
            </PanelHeader>

            <Group>
              <Div>
                <SegmentedControl
                  size="l"
                  name="adminTab"
                  value={adminTab}
                  onChange={(value) => setAdminTab(value as 'users' | 'transactions')}
                  options={[
                    { label: 'Клиенты', value: 'users' },
                    { label: 'Транзакции', value: 'transactions' }
                  ]}
                />
              </Div>
            </Group>

            <Search
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={adminTab === 'users' ? '\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0438\u043c\u0435\u043d\u0438, ID, \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0443...' : '\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044e, ID...'}
              after={null}
            />

            {adminTab === 'users' && (
              <Group>
                <Div>
                  <Button size="m" mode="secondary" before={<Icon28DownloadOutline />} onClick={downloadCSV}>
                    Скачать .csv
                  </Button>
                </Div>
                <Title level="3" style={{ margin: '0 16px 8px 16px' }}>Список клиентов</Title>
                {loading ? (
                  <Spinner size="l" />
                ) : (
                  clients
                    .filter(c =>
                      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (c.vk_id && c.vk_id.toString().includes(searchQuery)) ||
                      (c.phone && c.phone.includes(searchQuery))
                    )
                    .map(client => (
                      <SimpleCell
                        key={client.id}
                        onClick={() => openClientDetails(client)}
                        subtitle={`VK ID: ${client.vk_id} | Баланс: ${client.balance}`}
                        after={<Text style={{ color: '#8e8e93' }}>{client.registered_at}</Text>}
                      >
                        {client.full_name}
                      </SimpleCell>
                    ))
                )}
              </Group>
            )}

            {adminTab === 'transactions' && (
              <Group>
                <Div>
                  <Button size="m" mode="secondary" before={<Icon28DownloadOutline />} onClick={downloadTransactionsCSV}>
                    Скачать .csv
                  </Button>
                </Div>
                <Title level="3" style={{ margin: '0 16px 8px 16px' }}>История операций</Title>
                {loading ? (
                  <Spinner size="l" />
                ) : (
                  transactions
                    .filter(t =>
                      t.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (t.client_vk_id && t.client_vk_id.toString().includes(searchQuery)) ||
                      t.description.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(tx => (
                      <SimpleCell
                        key={tx.id}
                        subtitle={`${tx.description} | ${tx.date}`}
                        after={
                          <Text style={{
                            color: tx.points_change > 0 ? '#4bb34b' : '#ff3347',
                            fontWeight: 'bold',
                            textAlign: 'right'
                          }}>
                            {tx.points_change > 0 ? '+' : ''}{tx.points_change}
                          </Text>
                        }
                      >
                        {tx.client_name}
                        <Div style={{ padding: 0, marginTop: 4, color: '#8e8e93', fontSize: 13 }}>Чек: {tx.amount}₽</Div>
                      </SimpleCell>
                    ))
                )}
              </Group>
            )}
          </Panel>

          <Panel id="client_details">
            <PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel('admin')} />}>
              Карточка клиента
            </PanelHeader>

            {selectedClient && (
              <Group>
                <SimpleCell
                  before={<Avatar size={72} fallbackIcon={<Icon28UserOutline />} />}
                  subtitle={`VK ID: ${selectedClient.vk_id} | Реф. код: ${selectedClient.referral_code}`}
                >
                  <Title level="2">{selectedClient.full_name}</Title>
                  <Text style={{ color: '#8e8e93' }}>{selectedClient.phone || 'Телефон не указан'} | Статус: {selectedClient.status}</Text>
                  <Title level="3" style={{ marginTop: 8, color: '#0a84ff' }}>Баланс: {selectedClient.balance} баллов</Title>
                </SimpleCell>

                <FormItem top="Роль пользователя">
                  <SegmentedControl
                    size="m"
                    name="clientRole"
                    value={clientRole}
                    onChange={(v) => {
                      const newRole = v as string;
                      if (window.confirm(`Сменить роль пользователя на "${newRole === 'admin' ? 'Админ' : newRole === 'cashier' ? 'Кассир' : 'Обычный'}"?`)) {
                        setRole(selectedClient.vk_id, newRole);
                      }
                    }}
                    options={[
                      { label: 'Обычный', value: 'user' },
                      { label: 'Кассир', value: 'cashier' },
                      { label: 'Админ', value: 'admin' },
                    ]}
                  />
                </FormItem>

                <Div>
                  <Button size="l" stretched mode="primary" onClick={() => { setActivePanel('main'); setScanTarget(selectedClient.vk_id.toString()); window.location.hash = `#scan_${selectedClient.vk_id}`; }}>
                    Открыть кассу для клиента
                  </Button>
                </Div>
              </Group>
            )}

            <Group>
              <Title level="3" style={{ margin: '16px 16px 8px 16px' }}>История операций</Title>
              {selectedClient && transactions.filter(t => t.client_vk_id === selectedClient.vk_id).length === 0 ? (
                <Div><Text style={{ color: '#8e8e93', textAlign: 'center' }}>Нет ни одной операции</Text></Div>
              ) : (
                selectedClient && transactions.filter(t => t.client_vk_id === selectedClient.vk_id).map(tx => (
                  <SimpleCell
                    key={tx.id}
                    subtitle={`${tx.description} | ${tx.date}`}
                    after={
                      <Text style={{
                        color: tx.points_change > 0 ? '#4bb34b' : '#ff3347',
                        fontWeight: 'bold',
                        textAlign: 'right'
                      }}>
                        {tx.points_change > 0 ? '+' : ''}{tx.points_change}
                      </Text>
                    }
                  >
                    Чек: {tx.amount}₽
                  </SimpleCell>
                ))
              )}
            </Group>
          </Panel>

          <Panel id="scanner">
            <PanelHeader before={<PanelHeaderBack onClick={() => { setActivePanel('main'); setScanTarget(null); window.location.hash = ''; setIsDeducting(false); }} />}>
              Касса AiHookah
            </PanelHeader>

            {!scanTarget && !scanTargetData ? (
              <Group>
                <Div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <Title level="3" style={{ marginBottom: 8 }}>\u041f\u043e\u0438\u0441\u043a \u043a\u043b\u0438\u0435\u043d\u0442\u0430</Title>
                  <Text style={{ color: '#8e8e93' }}>\u0412\u0432\u0435\u0434\u0438\u0442\u0435 VK ID \u043a\u043b\u0438\u0435\u043d\u0442\u0430 \u0432\u0440\u0443\u0447\u043d\u0443\u044e</Text>
                </Div>
                <FormItem top="VK ID \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044f">
                  <Input
                    type="number"
                    placeholder="\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: 532232600"
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val) { setScanTarget(val); window.location.hash = `#scan_${val}`; }
                    }}
                  />
                </FormItem>
              </Group>
            ) : scanTargetData ? (
              <Group>
                <SimpleCell
                  before={<Avatar size={48} fallbackIcon={<Icon28UserOutline />} />}
                  subtitle={`ID: ${scanTargetData.vk_id} | Текущий баланс: ${scanTargetData.balance}`}
                >
                  <Title level="3">{scanTargetData.first_name} {scanTargetData.last_name}</Title>
                </SimpleCell>

                <FormItem>
                  <SimpleCell
                    after={<Switch checked={isDeducting} onChange={(e) => setIsDeducting(e.target.checked)} />}
                    subtitle="Укажите сумму для СПИСАНИЯ баллов вместо оплаты"
                  >
                    Оплатить баллами
                  </SimpleCell>
                </FormItem>

                <FormItem top={isDeducting ? "Сумма списания (баллов)" : "Сумма чека (рублей)"}>
                  <Input
                    type="number"
                    value={transactionAmount}
                    onChange={e => setTransactionAmount(e.target.value)}
                    placeholder={isDeducting ? "Например: 200" : "Например: 1500"}
                  />
                  {isDeducting ? (
                    <Text style={{ marginTop: 8, color: '#8e8e93', fontSize: 13 }}>
                      Будет списано: {transactionAmount || 0} баллов. Остаток: {Math.max(0, scanTargetData.balance - (parseFloat(transactionAmount) || 0))}
                    </Text>
                  ) : (
                    <Text style={{ marginTop: 8, color: '#8e8e93', fontSize: 13 }}>
                      Будет начислено: {((parseFloat(transactionAmount) || 0) * 0.05).toFixed(2)} баллов (5%)
                    </Text>
                  )}
                </FormItem>

                <Div>
                  <Button
                    size="l"
                    stretched
                    mode="primary"
                    onClick={processTransaction}
                    disabled={loading || !transactionAmount || (isDeducting && parseFloat(transactionAmount) > scanTargetData.balance)}
                  >
                    {loading ? <Spinner size="s" /> : (isDeducting ? "Списать баллы" : "Провести чек")}
                  </Button>
                </Div>
              </Group>
            ) : (
              <Group style={{ height: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size="l" />
              </Group>
            )}
          </Panel>
        </View>
      </SplitCol>
    </SplitLayout>
  );
}

export default App;
