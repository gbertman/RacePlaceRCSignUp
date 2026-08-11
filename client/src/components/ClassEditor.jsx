import { useState, useEffect, useRef } from 'react';
import { Button, Card, Group, NativeSelect, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';

function ClassEditor({ classes, trackTypes, onSave }) {
    // items: { name, type }
    const [items, setItems] = useState([]);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        setItems(classes);
    }, [classes]);

    useEffect(() => {
        if (trackTypes.length > 0 && !trackTypes.includes(newType)) {
            setNewType(trackTypes[0]);
        }
    }, [trackTypes, newType]);

    const add = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (items.some(item => item.name.toLowerCase() === trimmed.toLowerCase())) {
            alert(`A class named "${trimmed}" already exists.`);
            return;
        }
        setItems([...items, { name: trimmed, type: newType }]);
        setNewName('');
        if (inputRef.current) {
            setTimeout(() => inputRef.current.focus(), 0);
        }
    };

    const remove = (idx) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const save = () => {
        const payload = { classes: items };
        fetch('/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(() => {
                alert('Classes saved successfully!');
                if (onSave) onSave();
            })
            .catch(err => {
                alert('Error saving classes: ' + err.message);
                console.error('Save error:', err);
            });
    };
    const groupedItems = items.reduce((groups, item) => {
        const type = item.type || 'Other';
        if (!groups[type]) {
            groups[type] = [];
        }
        groups[type].push(item);
        return groups;
    }, {});

    return (
        <Stack gap="lg">
            <Title order={2} size="h4">Edit Classes</Title>
            <Group align="end" grow wrap="wrap">
                <TextInput
                    id="new-class-name"
                    ref={inputRef}
                    label="Class"
                    placeholder="New class"
                    value={newName}
                    onChange={e => setNewName(e.currentTarget.value)}
                    onKeyDown={e => e.key === 'Enter' && add()}
                />
                <NativeSelect
                    id="new-class-track"
                    label="Track"
                    value={newType}
                    onChange={e => setNewType(e.currentTarget.value)}
                    data={trackTypes}
                />
                <Button onClick={add}>Add</Button>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
                {Object.entries(groupedItems).map(([type, group]) => (
                    <Stack key={type} gap="xs">
                        <Title order={3} size="h5">{type}</Title>
                        <Stack gap="xs">
                            {group.map((c, idx) => {
                                const actualIdx = items.findIndex(item => item.name === c.name && item.type === c.type);
                                return (
                                    <Card key={`${c.name}-${idx}`} withBorder padding="sm">
                                      <Group justify="space-between">
                                        <div>
                                            <Text>{c.name}</Text>
                                            <Text c="dimmed" size="sm">{c.type}</Text>
                                        </div>
                                        <Button size="xs" color="red" variant="light" onClick={() => remove(actualIdx)}>Remove</Button>
                                      </Group>
                                    </Card>
                                );
                            })}
                        </Stack>
                    </Stack>
                ))}
            </SimpleGrid>
            <Button color="green" onClick={save} style={{ alignSelf: 'flex-start' }}>Save Classes</Button>
        </Stack>
    );
}

export default ClassEditor;
